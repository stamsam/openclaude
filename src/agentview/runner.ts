import { spawn } from 'child_process'
import { once } from 'events'
import { open, stat } from 'fs/promises'
import { resolve } from 'path'
import { emitKeypressEvents } from 'readline'
import type { BackgroundJob, LaunchBackgroundJobOptions } from './types.js'
import {
  appendJobInput,
  appendJobLog,
  isProcessAlive,
  loadJob,
  readJobLogTail,
  updateJob,
} from './store.js'
import { getJobInputPath, getJobLogPath } from './paths.js'

function cliInvocation(): { command: string; args: string[] } {
  const script = process.argv[1]
  if (!script) {
    return { command: process.execPath, args: [] }
  }
  return { command: process.execPath, args: [script] }
}

function buildRunArgs(job: BackgroundJob): string[] {
  const { args } = cliInvocation()
  const runArgs = [
    ...args,
    '-p',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--replay-user-messages',
    '--session-id',
    job.session_id,
    '--name',
    job.name,
  ]

  if (job.provider) {
    runArgs.push('--provider', job.provider)
  }
  if (job.model) {
    runArgs.push('--model', job.model)
  }
  if (job.agent) {
    runArgs.push('--agent', job.agent)
  }
  if (job.permission_mode) {
    runArgs.push('--permission-mode', job.permission_mode)
  }

  return runArgs
}

function statusPatchFromJsonLine(line: string): Partial<BackgroundJob> | null {
  try {
    const message = JSON.parse(line) as {
      type?: string
      subtype?: string
      status?: string
      result?: string
    }
    if (message.type === 'result') {
      return {
        status: 'idle',
        input_needed: false,
      }
    }
    if (
      message.type === 'system' &&
      message.subtype === 'session_state_changed'
    ) {
      if (message.status === 'requires_action') {
        return {
          status: 'needs_input',
          input_needed: true,
        }
      }
      if (message.status === 'idle') {
        return {
          status: 'idle',
          input_needed: false,
        }
      }
      if (message.status === 'working') {
        return {
          status: 'working',
          input_needed: false,
        }
      }
    }
  } catch {
    return null
  }
  return null
}

async function pumpJobInputToChild(
  id: string,
  write: (text: string) => boolean | void,
  isDone: () => boolean,
): Promise<void> {
  const inputPath = resolve(getJobInputPath(id))
  let offset = 0
  while (!isDone()) {
    try {
      const info = await stat(inputPath)
      if (info.size > offset) {
        const file = await open(inputPath, 'r')
        try {
          const buffer = Buffer.alloc(info.size - offset)
          await file.read(buffer, 0, buffer.length, offset)
          offset = info.size
          write(buffer.toString('utf8'))
        } finally {
          await file.close()
        }
      }
    } catch {
      // input file may not exist yet
    }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 200))
  }
}

export async function launchBackgroundJob(
  job: BackgroundJob,
  _options: LaunchBackgroundJobOptions = {},
): Promise<BackgroundJob> {
  const { command, args } = cliInvocation()
  const child = spawn(command, [...args, 'bg-runner', job.id], {
    cwd: job.worktree_path ?? job.cwd,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      OPENCLAUDE_BG_RUNNER: '1',
    },
  })
  child.unref()

  return (await updateJob(job.id, {
    status: 'working',
    pid: child.pid,
    provider: job.provider,
    model: job.model,
    agent: job.agent,
    permission_mode: job.permission_mode,
  })) as BackgroundJob
}

export async function runBackgroundJob(id: string): Promise<void> {
  const job = await loadJob(id)
  if (!job) {
    process.stderr.write(`Unknown background session: ${id}\n`)
    process.exitCode = 1
    return
  }

  await updateJob(id, {
    status: 'working',
    pid: process.pid,
    latest_output_tail: '',
  })
  await appendJobLog(
    id,
    `[agent-view] started ${new Date().toISOString()} in ${job.worktree_path ?? job.cwd}\n`,
  )
  await appendJobInput(id, job.prompt)

  const { command } = cliInvocation()
  const child = spawn(command, buildRunArgs(job), {
    cwd: job.worktree_path ?? job.cwd,
    env: {
      ...process.env,
      OPENCLAUDE_BG_CHILD: '1',
      OPENCLAUDE_AGENTVIEW_CHILD_ID: id,
      OPENCLAUDE_DISABLE_GOALS: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stopping = false
  let childExited = false
  let stdoutBuffer = ''
  const stop = () => {
    stopping = true
    if (child.pid && isProcessAlive(child.pid)) {
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
    }
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)

  child.stdout?.on('data', chunk => {
    const text = chunk.toString()
    void appendJobLog(id, text)
    stdoutBuffer += text
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const patch = statusPatchFromJsonLine(line)
      if (patch) void updateJob(id, patch)
    }
  })
  child.stderr?.on('data', chunk => {
    void appendJobLog(id, chunk.toString())
  })
  const inputPump = pumpJobInputToChild(
    id,
    text => child.stdin?.write(text),
    () => childExited || child.killed,
  )

  const [code, signal] = (await once(child, 'exit')) as [
    number | null,
    NodeJS.Signals | null,
  ]
  childExited = true
  await inputPump.catch(() => {})
  const tail = await readJobLogTail(id)
  const status = stopping || signal === 'SIGTERM' ? 'stopped' : code === 0 ? 'completed' : 'failed'
  await updateJob(id, {
    status,
    exit_code: code,
    signal,
    pid: process.pid,
    latest_output_tail: tail,
  })
  await appendJobLog(
    id,
    `[agent-view] ${status} ${new Date().toISOString()} exit=${code ?? 'null'} signal=${signal ?? 'null'}\n`,
  )
}

export async function stopJob(id: string): Promise<BackgroundJob | null> {
  const job = await loadJob(id)
  if (!job) return null

  if (job.pid && isProcessAlive(job.pid)) {
    try {
      process.kill(-job.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(job.pid, 'SIGTERM')
      } catch {
        // Treat a vanished process as stopped below.
      }
    }
  }

  const tail = await readJobLogTail(id)
  return updateJob(id, {
    status: 'stopped',
    latest_output_tail: tail,
  })
}

export async function waitForProcessExit(
  pid: number | undefined,
  timeoutMs = 750,
): Promise<boolean> {
  if (!pid || pid <= 0) return true
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await new Promise(resolveTimer => setTimeout(resolveTimer, 25))
  }
  return !isProcessAlive(pid)
}

export type AttachResult = 'exit' | 'dashboard'

export async function attachToJob(id: string): Promise<AttachResult> {
  const job = await loadJob(id)
  if (!job) {
    process.stderr.write(`Unknown background session: ${id}\n`)
    process.exitCode = 1
    return 'exit'
  }

  process.stdout.write(
    `Attaching to ${job.id} (${job.name})\n` +
      `Type a message and press Enter to send it to this background session.\n` +
      `Press left/right arrow or Esc on an empty prompt to detach; Ctrl+C exits.\n\n`,
  )

  const path = resolve(getJobLogPath(id))
  let offset = 0
  const initial = await readJobLogTail(id, 24_000)
  if (initial) {
    process.stdout.write(initial)
  }
  try {
    offset = (await stat(path)).size
  } catch {
    offset = 0
  }

  let done = false
  let result: AttachResult = 'exit'
  let line = ''
  const renderPrompt = () => {
    if (!process.stdin.isTTY) return
    process.stdout.write(`\r\nagent:${id}> ${line}`)
  }
  const onSigint = () => {
    done = true
  }
  const wasRaw = process.stdin.isRaw
  const onKeypress = (chunk: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
    if ((key?.name === 'left' || key?.name === 'right' || key?.name === 'escape') && line.length === 0) {
      result = 'dashboard'
      done = true
    } else if (key?.ctrl && key?.name === 'c') {
      result = 'exit'
      done = true
    } else if (key?.name === 'return') {
      const message = line.trim()
      line = ''
      if (message) {
        void appendJobInput(id, message)
          .then(() => updateJob(id, { status: 'working', input_needed: false }))
          .then(() => {
            process.stdout.write(`\r\n[agent-view] sent\n`)
            renderPrompt()
          })
          .catch(error => {
            process.stdout.write(`\r\n[agent-view] failed to send: ${(error as Error).message}\n`)
            renderPrompt()
          })
      } else {
        renderPrompt()
      }
    } else if (key?.name === 'backspace' || key?.name === 'delete') {
      line = line.slice(0, -1)
      process.stdout.write(`\ragent:${id}> ${line} \b`)
    } else if (key?.name === 'escape') {
      line = ''
      renderPrompt()
    } else if (!key?.ctrl && !key?.meta && chunk) {
      line += chunk
      process.stdout.write(chunk)
    }
  }
  process.once('SIGINT', onSigint)
  if (process.stdin.isTTY) {
    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('keypress', onKeypress)
    renderPrompt()
  }

  while (!done) {
    const current = await loadJob(id)
    if (!current) break
    try {
      const info = await stat(path)
      if (info.size > offset) {
        const { open } = await import('fs/promises')
        const file = await open(path, 'r')
        try {
          const buffer = Buffer.alloc(info.size - offset)
          await file.read(buffer, 0, buffer.length, offset)
          process.stdout.write(`\r\n${buffer.toString('utf8')}`)
          renderPrompt()
          offset = info.size
        } finally {
          await file.close()
        }
      }
    } catch {
      // log may not exist yet
    }

    if (!current.pid || !isProcessAlive(current.pid)) {
      break
    }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 1000))
  }
  process.off('SIGINT', onSigint)
  if (process.stdin.isTTY) {
    process.stdin.off('keypress', onKeypress)
    process.stdin.setRawMode(wasRaw)
  }
  return result
}
