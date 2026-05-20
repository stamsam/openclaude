import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'
import { SessionManager } from './sessionManager.js'

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  signals: string[] = []

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal)
    queueMicrotask(() => this.emit('exit', 0, signal))
    return true
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('SessionManager', () => {
  test('does not count stopped sessions toward maxSessions', () => {
    const children: FakeChildProcess[] = []
    const manager = new SessionManager(
      {
        spawnSession: () => {
          const child = new FakeChildProcess()
          children.push(child)
          return child as unknown as ChildProcess
        },
      },
      { maxSessions: 1 },
    )

    manager.createSession('/tmp')
    expect(() => manager.createSession('/tmp')).toThrow()

    children[0].emit('exit', 0, null)

    const replacement = manager.createSession('/tmp')
    expect(replacement.status).toBe('running')
  })

  test('destroyAll terminates sessions before clearing them', async () => {
    const children: FakeChildProcess[] = []
    const manager = new SessionManager({
      spawnSession: () => {
        const child = new FakeChildProcess()
        children.push(child)
        return child as unknown as ChildProcess
      },
    })

    manager.createSession('/tmp')
    manager.createSession('/tmp')

    await manager.destroyAll()

    expect(children.map(child => child.signals)).toEqual([
      ['SIGTERM'],
      ['SIGTERM'],
    ])
    expect(manager.listSessions()).toEqual([])
  })

  test('idle detached sessions are stopped by timer', async () => {
    const child = new FakeChildProcess()
    const manager = new SessionManager(
      {
        spawnSession: () => child as unknown as ChildProcess,
      },
      { idleTimeoutMs: 5 },
    )

    const session = manager.createSession('/tmp')
    expect(manager.attachSession(session.id)).toBe(true)
    manager.detachSession(session.id)

    await wait(20)

    expect(child.signals).toEqual(['SIGTERM'])
  })
})
