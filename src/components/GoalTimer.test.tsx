import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { render } from '../ink.js'
import {
  beginGoalRuntimeSession,
  loadGoal,
  resetGoalMemoryCache,
  setGoal,
} from '../goal/core.js'
import { getGoalPaths } from '../goal/paths.js'
import { GoalTimer } from './GoalTimer.js'

const ORIGINAL_OPENCLAUDE_HOME = process.env.OPENCLAUDE_HOME

let home: string

describe('GoalTimer', () => {
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'openclaude-goal-timer-'))
    process.env.OPENCLAUDE_HOME = home
    resetGoalMemoryCache()
  })

  afterEach(async () => {
    resetGoalMemoryCache()
    if (ORIGINAL_OPENCLAUDE_HOME === undefined) {
      delete process.env.OPENCLAUDE_HOME
    } else {
      process.env.OPENCLAUDE_HOME = ORIGINAL_OPENCLAUDE_HOME
    }
    await rm(getGoalPaths({ ...process.env, OPENCLAUDE_HOME: home }).home, {
      recursive: true,
      force: true,
    })
  })

  test('unmounting the footer timer does not end an active goal session', async () => {
    await setGoal('Keep tracking while dialogs open')
    const stream = new PassThrough()
    const instance = await render(<GoalTimer />, {
      stdout: stream as unknown as NodeJS.WriteStream,
      patchConsole: false,
    })

    await new Promise(resolve => setTimeout(resolve, 20))
    await beginGoalRuntimeSession()
    instance.unmount()

    const goal = await loadGoal()
    expect(goal?.status).toBe('active')
    expect(goal?.active_session_started_at).toBeDefined()
  })
})
