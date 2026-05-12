import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { clearGoal, resetGoalMemoryCache } from '../../goal/core.js'
import { call } from './goal.js'

const ORIGINAL_OPENCLAUDE_HOME = process.env.OPENCLAUDE_HOME

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
    expect(result.nextInput).toBe('Continue making progress on the active goal.')
    expect(result.submitNextInput).toBe(true)
  })

  test('resuming a paused goal requests an immediate follow-up turn', async () => {
    await call('Resumeable goal', {} as never)
    await call('pause', {} as never)

    const result = await call('resume', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return

    expect(result.value).toContain('Goal resumed:')
    expect(result.nextInput).toBe('Continue making progress on the active goal.')
    expect(result.submitNextInput).toBe(true)
  })
})
