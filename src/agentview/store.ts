import { randomBytes, randomUUID } from 'crypto'
import { mkdir, readFile, readdir, rm, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { basename, join } from 'path'
import { safeParseJSON } from '../utils/json.js'
import { redactSecrets } from './redact.js'
import {
  getJobDir,
  getJobInputPath,
  getJobLogPath,
  getJobsDir,
  getJobStatePath,
} from './paths.js'
import type {
  AgentViewStatus,
  BackgroundJob,
  CreateBackgroundJobOptions,
} from './types.js'
import { prepareAgentViewWorktree } from './worktree.js'

const MAX_PROMPT_SUMMARY = 80
const MAX_NAME = 42

export function createJobId(): string {
  return randomBytes(4).toString('hex')
}

export function summarizePrompt(prompt: string, max = MAX_PROMPT_SUMMARY): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function inferName(prompt: string): string {
  const summary = summarizePrompt(prompt, MAX_NAME)
  return summary || 'Background session'
}

function currentBranch(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || undefined
  } catch {
    return undefined
  }
}

export async function createBackgroundJob(
  options: CreateBackgroundJobOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackgroundJob> {
  const now = new Date().toISOString()
  await mkdir(getJobsDir(env), { recursive: true })

  let id = createJobId()
  while (existsSync(getJobDir(id, env))) {
    id = createJobId()
  }

  const job: BackgroundJob = {
    id,
    session_id: randomUUID(),
    name: options.name?.trim() || inferName(options.prompt),
    prompt: redactSecrets(options.prompt),
    prompt_summary: summarizePrompt(redactSecrets(options.prompt)),
    cwd: options.cwd,
    branch: currentBranch(options.cwd),
    provider: options.provider,
    model: options.model,
    agent: options.agent,
    permission_mode: options.permissionMode,
    respawn_of: options.respawnOf,
    status: 'idle',
    created_at: now,
    updated_at: now,
    input_needed: false,
  }

  if (options.useWorktree === true) {
    const worktree = await prepareAgentViewWorktree({ id, cwd: options.cwd })
    if (worktree) {
      job.worktree_path = worktree.path
      job.worktree_branch = worktree.branch
    }
  }

  await mkdir(getJobDir(id, env), { recursive: true })
  await saveJob(job, env)
  return job
}

export async function saveJob(
  job: BackgroundJob,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await mkdir(getJobDir(job.id, env), { recursive: true })
  const sanitized: BackgroundJob = {
    ...job,
    prompt: redactSecrets(job.prompt),
    prompt_summary: redactSecrets(job.prompt_summary),
    latest_output_tail: redactSecrets(job.latest_output_tail),
  }
  await writeFile(getJobStatePath(job.id, env), `${JSON.stringify(sanitized, null, 2)}\n`)
}

export async function loadJob(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackgroundJob | null> {
  try {
    const parsed = safeParseJSON(await readFile(getJobStatePath(id, env), 'utf8'), false)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as BackgroundJob
  } catch {
    return null
  }
}

export async function updateJob(
  id: string,
  patch: Partial<BackgroundJob>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackgroundJob | null> {
  const job = await loadJob(id, env)
  if (!job) return null
  const next: BackgroundJob = {
    ...job,
    ...patch,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  }
  await saveJob(next, env)
  return next
}

export function isProcessAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function refreshRuntimeStatus(
  job: BackgroundJob,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackgroundJob> {
  if (job.pid && ['working', 'needs_input', 'idle'].includes(job.status)) {
    if (!isProcessAlive(job.pid)) {
      const next: BackgroundJob = {
        ...job,
        status: job.exit_code === 0 ? 'completed' : 'failed',
        updated_at: new Date().toISOString(),
      }
      await saveJob(next, env)
      return next
    }
  }
  return job
}

export async function listJobs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackgroundJob[]> {
  await mkdir(getJobsDir(env), { recursive: true })
  const entries = await readdir(getJobsDir(env), { withFileTypes: true })
  const jobs: BackgroundJob[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const job = await loadJob(entry.name, env)
    if (job) jobs.push(await refreshRuntimeStatus(job, env))
  }
  return jobs.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
}

export async function appendJobLog(
  id: string,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { appendFile } = await import('fs/promises')
  await mkdir(getJobDir(id, env), { recursive: true })
  await appendFile(getJobLogPath(id, env), redactSecrets(text))
}

export function formatJobInputMessage(content: string): string {
  return `${JSON.stringify({
    type: 'user',
    session_id: '',
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
    timestamp: new Date().toISOString(),
    uuid: randomUUID(),
  })}\n`
}

export function formatJobControlRequest(request: Record<string, unknown>): string {
  return `${JSON.stringify({
    type: 'control_request',
    request_id: randomUUID(),
    request,
  })}\n`
}

export async function appendJobInput(
  id: string,
  content: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { appendFile } = await import('fs/promises')
  await mkdir(getJobDir(id, env), { recursive: true })
  await appendFile(getJobInputPath(id, env), formatJobInputMessage(content), {
    mode: 0o600,
  })
}

export async function appendJobModelSwitch(
  id: string,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { appendFile } = await import('fs/promises')
  await mkdir(getJobDir(id, env), { recursive: true })
  await appendFile(
    getJobInputPath(id, env),
    formatJobControlRequest({
      subtype: 'set_model',
      model,
    }),
    {
      mode: 0o600,
    },
  )
}

export async function appendJobProviderSwitch(
  id: string,
  options: {
    providerProfileId: string
    provider: string
    model?: string
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { appendFile } = await import('fs/promises')
  await mkdir(getJobDir(id, env), { recursive: true })
  await appendFile(
    getJobInputPath(id, env),
    formatJobControlRequest({
      subtype: 'set_provider',
      provider_profile_id: options.providerProfileId,
      provider: options.provider,
      model: options.model,
    }),
    {
      mode: 0o600,
    },
  )
}

export async function readJobLogTail(
  id: string,
  maxBytes = 16_000,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const { stat, open } = await import('fs/promises')
    const path = getJobLogPath(id, env)
    const info = await stat(path)
    const start = Math.max(0, info.size - maxBytes)
    const length = info.size - start
    const file = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(length)
      await file.read(buffer, 0, length, start)
      return redactSecrets(buffer.toString('utf8'))
    } finally {
      await file.close()
    }
  } catch {
    return ''
  }
}

export async function removeJob(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const jobDir = getJobDir(id, env)
  let job: BackgroundJob | null = null
  try {
    const parsed = safeParseJSON(
      await readFile(join(jobDir, 'state.json'), 'utf8'),
      false,
    )
    if (parsed && typeof parsed === 'object') {
      job = parsed as BackgroundJob
    }
  } catch {
    return false
  }
  if (!job) return false
  if (job.pid && isProcessAlive(job.pid) && job.status !== 'stopped') {
    return false
  }
  try {
    await unlink(join(jobDir, 'state.json'))
  } catch {
    // The recursive directory removal below is the source of truth.
  }
  await rm(jobDir, { recursive: true, force: true })
  return true
}

export function labelForStatus(status: AgentViewStatus): string {
  switch (status) {
    case 'needs_input':
      return 'Needs input'
    case 'working':
      return 'Working'
    case 'idle':
      return 'Idle'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'stopped':
      return 'Stopped'
  }
}

export function displayDirectory(cwd: string): string {
  return basename(cwd) || cwd
}
