import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  appendJobInput,
  appendJobModelSwitch,
  appendJobProviderSwitch,
  appendJobLog,
  createBackgroundJob,
  createJobId,
  formatJobControlRequest,
  formatJobInputMessage,
  listJobs,
  loadJob,
  readJobLogTail,
  removeJob,
  updateJob,
} from './store.js'
import { attachToJob, stopJob } from './runner.js'
import { formatBackgroundStarted } from './cli.js'
import { redactSecrets } from './redact.js'
import { getJobInputPath, getJobStatePath } from './paths.js'

const ORIGINAL_OPENCLAUDE_HOME = process.env.OPENCLAUDE_HOME
const ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME = process.env.OPENCLAUDE_AGENTVIEW_HOME

let home: string
let testEnv: NodeJS.ProcessEnv

describe.serial('agent view job store', () => {
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'openclaude-agent-view-'))
    testEnv = { ...process.env, OPENCLAUDE_AGENTVIEW_HOME: home }
    process.env.OPENCLAUDE_AGENTVIEW_HOME = home
  })

  afterEach(async () => {
    if (ORIGINAL_OPENCLAUDE_HOME === undefined) {
      delete process.env.OPENCLAUDE_HOME
    } else {
      process.env.OPENCLAUDE_HOME = ORIGINAL_OPENCLAUDE_HOME
    }
    if (ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME === undefined) {
      delete process.env.OPENCLAUDE_AGENTVIEW_HOME
    } else {
      process.env.OPENCLAUDE_AGENTVIEW_HOME = ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME
    }
    await rm(home, { recursive: true, force: true })
  })

  test('creates short job ids', () => {
    expect(createJobId()).toMatch(/^[a-f0-9]{8}$/)
  })

  test('persists metadata and lists jobs by recent update', async () => {
    const first = await createBackgroundJob({
      prompt: 'fix the failing tests',
      cwd: process.cwd(),
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    }, testEnv)
    const second = await createBackgroundJob({
      prompt: 'review the repo',
      cwd: process.cwd(),
      provider: 'openrouter',
      model: 'openrouter/free',
      agent: 'code-reviewer',
    }, testEnv)

    await updateJob(first.id, { status: 'completed' }, testEnv)
    const jobs = await listJobs(testEnv)

    expect(await loadJob(first.id, testEnv)).toMatchObject({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      status: 'completed',
    })
    expect(jobs.map(job => job.id)).toContain(first.id)
    expect(jobs.map(job => job.id)).toContain(second.id)
    expect(await loadJob(second.id, testEnv)).toMatchObject({
      agent: 'code-reviewer',
    })
  })

  test('keeps provider and model independent across sessions', async () => {
    const a = await createBackgroundJob({
      prompt: 'one',
      cwd: process.cwd(),
      provider: 'groq',
      model: 'model-a',
    }, testEnv)
    const b = await createBackgroundJob({
      prompt: 'two',
      cwd: process.cwd(),
      provider: 'openrouter',
      model: 'model-b',
    }, testEnv)

    await appendJobLog(a.id, 'hello from a\n', testEnv)
    const originalWrite = process.stdout.write
    process.stdout.write = (() => true) as typeof process.stdout.write
    try {
      await attachToJob(a.id)
    } finally {
      process.stdout.write = originalWrite
    }

    expect(await loadJob(a.id, testEnv)).toMatchObject({ provider: 'groq', model: 'model-a' })
    expect(await loadJob(b.id, testEnv)).toMatchObject({
      provider: 'openrouter',
      model: 'model-b',
    })
  })

  test('redacts secrets from metadata and logs', async () => {
    const job = await createBackgroundJob({
      prompt: 'use OPENAI_API_KEY=sk-secret-value',
      cwd: process.cwd(),
    }, testEnv)
    await appendJobLog(job.id, 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz\n', testEnv)
    const stored = await loadJob(job.id, testEnv)
    const log = await readJobLogTail(job.id, 16_000, testEnv)

    expect(stored?.prompt).toContain('[REDACTED]')
    expect(log).toContain('[REDACTED]')
    expect(redactSecrets('GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED]')
  })

  test('formats and persists stream-json input messages for interactive attach', async () => {
    const line = formatJobInputMessage('continue the task')
    const parsed = JSON.parse(line)

    expect(parsed).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: 'continue the task',
      },
      parent_tool_use_id: null,
    })
    expect(parsed.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    const job = await createBackgroundJob({ prompt: 'first', cwd: process.cwd() }, testEnv)
    await appendJobInput(job.id, 'second turn', testEnv)
    const input = await Bun.file(getJobInputPath(job.id, testEnv)).text()
    expect(input).toContain('"content":"second turn"')
  })

  test('formats and persists model switch control requests', async () => {
    const line = formatJobControlRequest({ subtype: 'set_model', model: 'model-b' })
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      type: 'control_request',
      request: {
        subtype: 'set_model',
        model: 'model-b',
      },
    })
    expect(parsed.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    const job = await createBackgroundJob({ prompt: 'first', cwd: process.cwd() }, testEnv)
    await appendJobModelSwitch(job.id, 'model-c', testEnv)
    const input = await Bun.file(getJobInputPath(job.id, testEnv)).text()
    expect(input).toContain('"subtype":"set_model"')
    expect(input).toContain('"model":"model-c"')
  })

  test('formats and persists provider switch control requests', async () => {
    const line = formatJobControlRequest({
      subtype: 'set_provider',
      provider_profile_id: 'provider_local',
      provider: 'oMLX',
      model: 'local-model',
    })
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      type: 'control_request',
      request: {
        subtype: 'set_provider',
        provider_profile_id: 'provider_local',
        provider: 'oMLX',
        model: 'local-model',
      },
    })

    const job = await createBackgroundJob({ prompt: 'first', cwd: process.cwd() }, testEnv)
    await appendJobProviderSwitch(job.id, {
      providerProfileId: 'provider_local',
      provider: 'oMLX',
      model: 'local-model',
    }, testEnv)
    const input = await Bun.file(getJobInputPath(job.id, testEnv)).text()
    expect(input).toContain('"subtype":"set_provider"')
    expect(input).toContain('"provider_profile_id":"provider_local"')
    expect(input).toContain('"provider":"oMLX"')
    expect(input).toContain('"model":"local-model"')
  })

  test('marks missing or dead pids as failed while listing', async () => {
    const job = await createBackgroundJob({ prompt: 'stale', cwd: process.cwd() }, testEnv)
    await updateJob(job.id, { status: 'working', pid: 99999999 }, testEnv)

    const jobs = await listJobs(testEnv)
    expect(jobs.find(item => item.id === job.id)?.status).toBe('failed')
  })

  test('stops a running process', async () => {
    const job = await createBackgroundJob({ prompt: 'sleep', cwd: process.cwd() }, testEnv)
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    await updateJob(job.id, { status: 'working', pid: child.pid }, testEnv)

    const stopped = await stopJob(job.id)
    expect(stopped?.status).toBe('stopped')
    child.kill('SIGKILL')
  })

  test('removes only safe completed or stopped jobs', async () => {
    const localHome = await mkdtemp(join(tmpdir(), 'openclaude-agent-view-remove-'))
    const env = { ...process.env, OPENCLAUDE_AGENTVIEW_HOME: localHome }
    try {
      const job = await createBackgroundJob({ prompt: 'done', cwd: process.cwd() }, env)
      const statePath = getJobStatePath(job.id, env)
      await updateJob(job.id, { status: 'completed' }, env)

      expect(await removeJob(job.id, env)).toBe(true)
      expect(existsSync(statePath)).toBe(false)
    } finally {
      await rm(localHome, { recursive: true, force: true })
    }
  })

  test('formats shell help for background jobs', async () => {
    const job = await createBackgroundJob({
      prompt: 'review',
      cwd: process.cwd(),
      provider: 'groq',
      model: 'llama',
    }, testEnv)

    expect(formatBackgroundStarted(job)).toContain(`openclaude attach ${job.id}`)
    expect(formatBackgroundStarted(job)).toContain('groq / llama')
  })

  test('formats agent route for background jobs', async () => {
    const job = await createBackgroundJob({
      prompt: 'review',
      cwd: process.cwd(),
      agent: 'code-reviewer',
    }, testEnv)

    expect(formatBackgroundStarted(job)).toContain('agent: @code-reviewer')
  })

  test('creates a git worktree when requested', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'openclaude-agent-view-repo-'))
    try {
      await new Promise<void>((resolve, reject) => {
        execFile('git', ['init'], { cwd: repo }, error => (error ? reject(error) : resolve()))
      })
      await Bun.write(join(repo, 'README.md'), 'test\n')
      await new Promise<void>((resolve, reject) => {
        execFile('git', ['add', 'README.md'], { cwd: repo }, error => (error ? reject(error) : resolve()))
      })
      await new Promise<void>((resolve, reject) => {
        execFile(
          'git',
          ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'],
          { cwd: repo },
          error => (error ? reject(error) : resolve()),
        )
      })

      const job = await createBackgroundJob(
        { prompt: 'isolated edit', cwd: repo, useWorktree: true },
        testEnv,
      )

      const repoPath = await realpath(repo)
      expect(job.worktree_path).toBe(join(repoPath, '.openclaude', 'worktrees', job.id))
      expect(job.worktree_branch).toBe(`openclaude-agentview/${job.id}`)
      expect(existsSync(join(job.worktree_path!, 'README.md'))).toBe(true)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
