import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { clearGoal, loadGoal, resetGoalMemoryCache } from '../../goal/core.js'
import { call } from './goal.js'

const ORIGINAL_OPENCLAUDE_HOME = process.env.OPENCLAUDE_HOME
const AUTOSTART_NEXT_INPUT = 'Continue making progress on the active goal.'
const PLAN_NEXT_INPUT = '/plan Continue making progress on the active goal.'

let testHome: string

describe('/goal command', () => {
  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), 'openclaude-goal-test-'))
    process.env.OPENCLAUDE_HOME = testHome
    resetGoalMemoryCache()
    await clearGoal()
  })

  afterEach(async () => {
    resetGoalMemoryCache()
    if (ORIGINAL_OPENCLAUDE_HOME === undefined) {
      delete process.env.OPENCLAUDE_HOME
    } else {
      process.env.OPENCLAUDE_HOME = ORIGINAL_OPENCLAUDE_HOME
    }
    await rm(testHome, { recursive: true, force: true })
  })

  test('setting a goal requests an immediate follow-up turn', async () => {
    const result = await call('Test whether custom OpenClaude subagents work', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.value).toContain('Goal set:')
    expect(result.value).toContain('Starting now.')
    expect(result.nextInput).toBe(AUTOSTART_NEXT_INPUT)
    expect(result.submitNextInput).toBe(true)
  })

  test('resuming a paused goal requests an immediate follow-up turn', async () => {
    await call('Resumeable goal', {} as never)
    await call('pause', {} as never)

    const result = await call('resume', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.value).toContain('Goal resumed:')
    expect(result.nextInput).toBe(AUTOSTART_NEXT_INPUT)
    expect(result.submitNextInput).toBe(true)
  })

  test('act continues without forcing plan mode', async () => {
    await call('Active goal', {} as never)

    const result = await call('act', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.nextInput).toBe(AUTOSTART_NEXT_INPUT)
    expect(result.submitNextInput).toBe(true)
  })

  test('plan routes through existing plan command', async () => {
    await call('Planning goal', {} as never)

    const result = await call('plan', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.nextInput).toBe(PLAN_NEXT_INPUT)
    expect(result.submitNextInput).toBe(true)
  })

  test('restore and tasks route through existing commands', async () => {
    const restore = await call('restore', {} as never)
    const tasks = await call('tasks', {} as never)

    expect(restore.type).toBe('text')
    expect(tasks.type).toBe('text')
    if (restore.type !== 'text' || tasks.type !== 'text') return

    expect(restore.nextInput).toBe('/rewind')
    expect(restore.submitNextInput).toBe(true)
    expect(tasks.nextInput).toBe('/tasks')
    expect(tasks.submitNextInput).toBe(true)
  })

  test('checkpoint records a goal checkpoint', async () => {
    await call('Checkpoint goal', {} as never)

    const result = await call('checkpoint before edit', {
      messages: [],
    } as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.value).toContain('Goal checkpoint recorded: before edit')
    const goal = await loadGoal()
    expect(goal!.checkpoints[0].message_id).toBeUndefined()
  })

  test('non-interactive goal paths avoid interactive commands', async () => {
    const context = {
      options: {
        isNonInteractiveSession: true,
      },
      messages: [],
    } as never

    const set = await call('Headless goal', context)
    expect(set.type).toBe('text')
    if (set.type !== 'text') return
    expect(set.nextInput).toBe(AUTOSTART_NEXT_INPUT)

    const plan = await call('plan', context)
    expect(plan.type).toBe('text')
    if (plan.type !== 'text') return
    expect(plan.value).toContain('interactive-only')
    expect(plan.nextInput).toBe(AUTOSTART_NEXT_INPUT)

    const restore = await call('restore', context)
    const tasks = await call('tasks', context)
    expect(restore.type).toBe('text')
    expect(tasks.type).toBe('text')
    if (restore.type !== 'text' || tasks.type !== 'text') return
    expect(restore.nextInput).toBeUndefined()
    expect(tasks.nextInput).toBeUndefined()
  })
})
