import { createBackgroundJob, listJobs, loadJob, readJobLogTail, removeJob } from './store.js'
import { attachToJob, launchBackgroundJob, runBackgroundJob, stopJob } from './runner.js'
import type { BackgroundJob } from './types.js'

export type ParsedDashboardPrompt = {
  prompt: string
  provider?: string
  model?: string
  agent?: string
  permissionMode?: string
}

export function parseDashboardPrompt(input: string): ParsedDashboardPrompt {
  const tokens = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  const clean = (value: string) => value.replace(/^(['"])(.*)\1$/, '$2')
  const result: ParsedDashboardPrompt = { prompt: '' }
  const prompt: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]
    if (token.startsWith('--provider=')) {
      result.provider = clean(token.slice('--provider='.length))
    } else if (token.startsWith('--model=')) {
      result.model = clean(token.slice('--model='.length))
    } else if (token.startsWith('--permission-mode=')) {
      result.permissionMode = clean(token.slice('--permission-mode='.length))
    } else if (token.startsWith('--agent=')) {
      result.agent = clean(token.slice('--agent='.length)).replace(/^@/, '')
    } else if (token === '--provider' && next) {
      result.provider = clean(next)
      index += 1
    } else if (token === '--model' && next) {
      result.model = clean(next)
      index += 1
    } else if (token === '--permission-mode' && next) {
      result.permissionMode = clean(next)
      index += 1
    } else if (token === '--agent' && next) {
      result.agent = clean(next).replace(/^@/, '')
      index += 1
    } else {
      prompt.push(clean(token))
    }
  }
  if (!result.agent && prompt[0]?.startsWith('@') && prompt[0].length > 1) {
    result.agent = prompt[0].slice(1)
    prompt.shift()
  }
  result.prompt = prompt.join(' ').trim()
  return result
}

export async function startBackgroundSession(options: {
  prompt: string
  cwd: string
  provider?: string
  model?: string
  agent?: string
  permissionMode?: string
  name?: string
}): Promise<BackgroundJob> {
  const parsed = parseDashboardPrompt(options.prompt)
  const prompt = parsed.prompt
  if (!prompt) {
    throw new Error('Background session prompt is required after any flags.')
  }
  const job = await createBackgroundJob({
    prompt,
    cwd: options.cwd,
    provider: parsed.provider ?? options.provider,
    model: parsed.model ?? options.model,
    agent: parsed.agent ?? options.agent,
    permissionMode: parsed.permissionMode ?? options.permissionMode,
    name: options.name,
    useWorktree: true,
  })
  return launchBackgroundJob(job)
}

export function formatBackgroundStarted(job: BackgroundJob): string {
  const modelLine = [job.provider, job.model].filter(Boolean).join(' / ')
  return [
    `backgrounded · ${job.id}`,
    modelLine ? `  model: ${modelLine}` : undefined,
    job.agent ? `  agent: @${job.agent}` : undefined,
    `  openclaude agents          list sessions`,
    `  openclaude attach ${job.id}    attach and send follow-up messages`,
    `  openclaude logs ${job.id}      show recent output`,
    `  openclaude stop ${job.id}      stop this session`,
    `  openclaude respawn ${job.id}   start a fresh copy`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function printLogs(id: string): Promise<void> {
  const job = await loadJob(id)
  if (!job) {
    process.stderr.write(`Unknown background session: ${id}\n`)
    process.exitCode = 1
    return
  }
  const tail = await readJobLogTail(id, 32_000)
  process.stdout.write(tail || `No logs yet for ${id}.\n`)
}

export async function stopAndReport(id: string): Promise<void> {
  const job = await stopJob(id)
  if (!job) {
    process.stderr.write(`Unknown background session: ${id}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`stopped · ${job.id}\n`)
}

export async function removeAndReport(id: string): Promise<void> {
  const removed = await removeJob(id)
  if (!removed) {
    process.stderr.write(
      `Could not remove ${id}. Stop it first, or check that the id exists.\n`,
    )
    process.exitCode = 1
    return
  }
  process.stdout.write(`removed · ${id}\n`)
}

export async function respawnBackgroundSession(id: string): Promise<BackgroundJob | null> {
  const source = await loadJob(id)
  if (!source) {
    return null
  }
  const job = await createBackgroundJob({
    prompt: source.prompt,
    cwd: source.cwd,
    provider: source.provider,
    model: source.model,
    agent: source.agent,
    permissionMode: source.permission_mode,
    name: `${source.name} (respawn)`,
    respawnOf: source.id,
    useWorktree: true,
  })
  return launchBackgroundJob(job)
}

export async function respawnAndReport(id: string): Promise<void> {
  const launched = await respawnBackgroundSession(id)
  if (!launched) {
    process.stderr.write(`Unknown background session: ${id}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`${formatBackgroundStarted(launched)}\n`)
}

export async function listAndReport(): Promise<void> {
  const jobs = await listJobs()
  if (jobs.length === 0) {
    process.stdout.write('No background sessions.\n')
    return
  }
  for (const job of jobs) {
    const model = [job.provider, job.model].filter(Boolean).join('/')
    const agent = job.agent ? `@${job.agent}` : '-'
    process.stdout.write(
      `${job.id}\t${job.status}\t${job.name}\t${model || '-'}\t${agent}\t${job.cwd}\n`,
    )
  }
}

export { attachToJob, runBackgroundJob }
