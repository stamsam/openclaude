import type { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type { SessionInfo } from './types.js'

type SpawnOptions = {
  model?: string
  provider?: string
  dangerouslySkipPermissions?: boolean
}

type SessionBackend = {
  spawnSession: (
    sessionId: string,
    cwd: string,
    options?: SpawnOptions,
  ) => ChildProcess
}

type SessionRuntime = {
  clientCount: number
  idleTimer: ReturnType<typeof setTimeout> | null
  forceTimer: ReturnType<typeof setTimeout> | null
  exitPromise: Promise<void>
  resolveExit: () => void
}

export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map()
  private runtimes: Map<string, SessionRuntime> = new Map()

  constructor(
    private backend: SessionBackend,
    private options: { idleTimeoutMs?: number; maxSessions?: number } = {},
  ) {}

  createSession(cwd: string, options: SpawnOptions = {}): SessionInfo {
    this.pruneStoppedSessions()
    const maxSessions = this.options.maxSessions ?? 0
    if (maxSessions > 0 && this.activeSessionCount() >= maxSessions) {
      throw new Error('Maximum number of sessions reached')
    }

    const id = randomUUID()
    const child = this.backend.spawnSession(id, cwd, options)

    const session: SessionInfo = {
      id,
      status: 'running',
      createdAt: Date.now(),
      workDir: cwd,
      process: child,
    }

    let resolveExit!: () => void
    const runtime: SessionRuntime = {
      clientCount: 0,
      idleTimer: null,
      forceTimer: null,
      exitPromise: new Promise<void>(resolve => {
        resolveExit = resolve
      }),
      resolveExit,
    }

    const finalize = () => {
      this.clearIdleTimer(runtime)
      this.clearForceTimer(runtime)
      session.status = 'stopped'
      session.process = null
      runtime.resolveExit()
    }

    child.once('exit', finalize)
    child.once('error', finalize)

    this.sessions.set(id, session)
    this.runtimes.set(id, runtime)

    return session
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id)
  }

  listSessions(): SessionInfo[] {
    this.pruneStoppedSessions()
    return Array.from(this.sessions.values())
  }

  attachSession(id: string): boolean {
    const session = this.sessions.get(id)
    const runtime = this.runtimes.get(id)
    if (!session?.process || !runtime) {
      return false
    }

    runtime.clientCount += 1
    this.clearIdleTimer(runtime)
    session.status = 'running'
    return true
  }

  detachSession(id: string): void {
    const session = this.sessions.get(id)
    const runtime = this.runtimes.get(id)
    if (!session?.process || !runtime) {
      return
    }

    runtime.clientCount = Math.max(0, runtime.clientCount - 1)
    if (runtime.clientCount === 0) {
      session.status = 'detached'
      this.scheduleIdleStop(id, session, runtime)
    }
  }

  stopSession(id: string): void {
    const session = this.sessions.get(id)
    const runtime = this.runtimes.get(id)
    if (!session?.process || !runtime) {
      return
    }

    session.status = 'stopping'
    this.clearIdleTimer(runtime)

    try {
      session.process.kill('SIGTERM')
    } catch {
      runtime.resolveExit()
      return
    }

    if (!runtime.forceTimer) {
      runtime.forceTimer = setTimeout(() => {
        if (session.process) {
          try {
            session.process.kill('SIGKILL')
          } catch {}
        }
      }, 2_000)
      runtime.forceTimer.unref?.()
    }
  }

  async removeSession(id: string): Promise<void> {
    this.stopSession(id)
    await this.waitForExit(id)
    this.sessions.delete(id)
    this.runtimes.delete(id)
  }

  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys())
    for (const id of ids) {
      this.stopSession(id)
    }
    await Promise.all(ids.map(id => this.waitForExit(id)))
    for (const id of ids) {
      this.sessions.delete(id)
      this.runtimes.delete(id)
    }
  }

  private activeSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.process && session.status !== 'stopped') {
        count += 1
      }
    }
    return count
  }

  private pruneStoppedSessions(): void {
    for (const [id, session] of this.sessions) {
      if (session.status === 'stopped') {
        this.sessions.delete(id)
        this.runtimes.delete(id)
      }
    }
  }

  private scheduleIdleStop(
    id: string,
    session: SessionInfo,
    runtime: SessionRuntime,
  ): void {
    this.clearIdleTimer(runtime)
    const idleTimeoutMs = this.options.idleTimeoutMs ?? 0
    if (idleTimeoutMs <= 0) {
      return
    }

    runtime.idleTimer = setTimeout(() => {
      if (runtime.clientCount === 0 && session.process) {
        this.stopSession(id)
      }
    }, idleTimeoutMs)
    runtime.idleTimer.unref?.()
  }

  private clearIdleTimer(runtime: SessionRuntime): void {
    if (runtime.idleTimer) {
      clearTimeout(runtime.idleTimer)
      runtime.idleTimer = null
    }
  }

  private clearForceTimer(runtime: SessionRuntime): void {
    if (runtime.forceTimer) {
      clearTimeout(runtime.forceTimer)
      runtime.forceTimer = null
    }
  }

  private async waitForExit(id: string): Promise<void> {
    const runtime = this.runtimes.get(id)
    if (!runtime) {
      return
    }

    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 3_000)
      timeout.unref?.()
      runtime.exitPromise.finally(() => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }
}
