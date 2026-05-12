import { mkdtemp, readFile, readdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  completeGoal,
  goalStatus,
  loadGoal,
  saveGoal,
  accountGoalTokens,
  recordGoalCheckpoint,
  buildContinuationPrompt,
  isGoalFeatureEnabled,
  parseGoalCompletionSignal,
  parseGoalPlanSignal,
  resetGoalMemoryCache,
  updateGoalAdvisoryPlanFromText,
} from './core.js'
import { getGoalPaths } from './paths.js'
import {
  subscribeOpenClaudeEvents,
  type OpenClaudeEvent,
} from '../events/openclaudeEvents.js'

function setupTestEnv() {
  const prev = process.env.OPENCLAUDE_HOME
  const dir = join(tmpdir(), `openclaude-goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  process.env.OPENCLAUDE_HOME = dir
  return {
    paths: getGoalPaths(process.env as NodeJS.ProcessEnv),
    cleanup: () => {
      if (prev === undefined) delete process.env.OPENCLAUDE_HOME
      else process.env.OPENCLAUDE_HOME = prev
    },
  }
}

describe('goal system', () => {
  let testEnv: ReturnType<typeof setupTestEnv> | undefined

  beforeEach(async () => {
    testEnv = setupTestEnv()
    resetGoalMemoryCache()
  })

  afterEach(async () => {
    resetGoalMemoryCache()
    testEnv?.cleanup()
    if (testEnv) {
      try { await rm(testEnv.paths.home, { recursive: true, force: true }) } catch {}
    }
  })

  test('sets a goal and persists it', async () => {
    const goal = await setGoal('Add dark mode toggle to settings')
    expect(goal.objective).toBe('Add dark mode toggle to settings')
    expect(goal.status).toBe('active')
    expect(goal.tokens_used).toBe(0)
    expect(goal.time_used_seconds).toBe(0)
    expect(goal.advisory_plan).toEqual([])
    expect(goal.verification_evidence).toEqual([])
    expect(goal.checkpoints).toEqual([])

    const raw = await readFile(testEnv!.paths.stateFile, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.objective).toBe('Add dark mode toggle to settings')
  })

  test('loads older goal state without plan or evidence fields', async () => {
    await saveGoal({
      objective: 'Legacy goal',
      success_criteria: 'Legacy success',
      status: 'active',
      progress_log: '',
      start_time: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      tokens_used: 0,
      time_used_seconds: 0,
      advisory_plan: [],
      verification_evidence: [],
      checkpoints: [],
    })
    const raw = JSON.parse(await readFile(testEnv!.paths.stateFile, 'utf8'))
    delete raw.advisory_plan
    delete raw.verification_evidence
    delete raw.checkpoints
    await writeFile(testEnv!.paths.stateFile, `${JSON.stringify(raw)}\n`)
    resetGoalMemoryCache()

    const goal = await loadGoal()
    expect(goal!.advisory_plan).toEqual([])
    expect(goal!.verification_evidence).toEqual([])
    expect(goal!.checkpoints).toEqual([])
  })

  test('loadGoal returns null when no goal exists', async () => {
    const goal = await loadGoal()
    expect(goal).toBeNull()
  })

  test('loadGoal returns the persisted goal', async () => {
    await setGoal('Fix all TypeScript errors')
    const goal = await loadGoal()
    expect(goal).not.toBeNull()
    expect(goal!.objective).toBe('Fix all TypeScript errors')
    expect(goal!.status).toBe('active')
  })

  test('/goal status shows active goal info', async () => {
    await setGoal('Run the test suite')
    const status = await goalStatus()
    expect(status).toContain('Run the test suite')
    expect(status).toContain('active')
    expect(status).toContain('Elapsed:')
    expect(status).toContain('Tokens used:')
  })

  test('/goal status shows no active goal message when empty', async () => {
    const status = await goalStatus()
    expect(status).toBe('No active goal.')
  })

  test('pauses an active goal', async () => {
    await setGoal('Refactor the auth module')
    const paused = await pauseGoal()
    expect(paused).not.toBeNull()
    expect(paused!.status).toBe('paused')
    expect(paused!.objective).toBe('Refactor the auth module')

    const reloaded = await loadGoal()
    expect(reloaded!.status).toBe('paused')
  })

  test('pauseGoal returns null when no active goal', async () => {
    const result = await pauseGoal()
    expect(result).toBeNull()
  })

  test('resumes a paused goal', async () => {
    await setGoal('Write integration tests')
    await pauseGoal()
    const resumed = await resumeGoal()
    expect(resumed).not.toBeNull()
    expect(resumed!.status).toBe('active')
  })

  test('completes an active goal', async () => {
    await setGoal('Finish the current task')
    const completed = await completeGoal('tests passed')
    expect(completed).not.toBeNull()
    expect(completed!.status).toBe('complete')
    expect(completed!.progress_log).toContain('tests passed')

    const reloaded = await loadGoal()
    expect(reloaded!.status).toBe('complete')
  })

  test('records goal checkpoints without treating them as completion', async () => {
    await setGoal('Finish checkpoint flow')
    const checkpointed = await recordGoalCheckpoint('before risky edit', 'msg-1')
    expect(checkpointed!.status).toBe('active')
    expect(checkpointed!.checkpoints).toHaveLength(1)
    expect(checkpointed!.checkpoints[0].label).toBe('before risky edit')

    const status = await goalStatus()
    expect(status).toContain('Checkpoints:')
    expect(status).toContain('before risky edit')
  })

  test('emits goal lifecycle events', async () => {
    const events: OpenClaudeEvent[] = []
    const unsubscribe = subscribeOpenClaudeEvents(event => {
      events.push(event)
    })
    try {
      await setGoal('Emit events')
      await recordGoalCheckpoint('event checkpoint')
      await pauseGoal()
    } finally {
      unsubscribe()
    }

    expect(events.map(event => event.type)).toEqual([
      'goal.set',
      'goal.checkpoint',
      'goal.pause',
    ])
  })

  test('resumeGoal returns null when no paused goal', async () => {
    const result = await resumeGoal()
    expect(result).toBeNull()
  })

  test('clears a goal removing the file content', async () => {
    await setGoal('Temporary goal')
    await clearGoal()
    const stateFile = await readFile(testEnv!.paths.stateFile, 'utf8')
    expect(stateFile).toBe('')
    expect(await loadGoal()).toBeNull()
  })

  test('accountGoalTokens increments token count', async () => {
    await setGoal('Build the API layer')
    await accountGoalTokens(1500)
    const goal = await loadGoal()
    expect(goal!.tokens_used).toBe(1500)
    expect(goal!.time_used_seconds).toBeGreaterThanOrEqual(0)
  })

  test('accountGoalTokens transitions to budget_limited when budget exceeded', async () => {
    await setGoal('Expensive operation', '', 1000)
    await accountGoalTokens(500)
    await accountGoalTokens(600)
    const goal = await loadGoal()
    expect(goal!.status).toBe('budget_limited')
    expect(goal!.tokens_used).toBe(1100)
    expect(goal!.progress_log).toContain('budget exhausted')
  })

  test('accountGoalTokens triggers budget_limited on exact match', async () => {
    await setGoal('Exact budget', '', 1000)
    await accountGoalTokens(1000)
    const goal = await loadGoal()
    expect(goal!.status).toBe('budget_limited')
    expect(goal!.tokens_used).toBe(1000)
  })

  test('accountGoalTokens is no-op when goal is paused', async () => {
    await setGoal('Paused operation')
    await pauseGoal()
    await accountGoalTokens(500)
    const goal = await loadGoal()
    expect(goal!.tokens_used).toBe(0)
    expect(goal!.status).toBe('paused')
  })

  test('accountGoalTokens is no-op when goal is cleared', async () => {
    await setGoal('Cleared operation')
    await clearGoal()
    await accountGoalTokens(500)
    const goal = await loadGoal()
    expect(goal).toBeNull()
  })

  test('buildContinuationPrompt contains objective and directives', async () => {
    const goal = await setGoal('Remove Redux from the app')
    const prompt = buildContinuationPrompt(goal)
    expect(prompt).toContain('Remove Redux from the app')
    expect(prompt).toContain('GOAL_COMPLETE')
    expect(prompt).toContain('Evidence:')
    expect(prompt).toContain('CONTINUE')
    expect(prompt).toContain('The goal is NOT complete merely because a plan or checklist is complete')
    expect(prompt).toContain('Plans are disposable working state')
    expect(prompt).toContain('GOAL_PLAN:')
    expect(prompt).toContain('A fully done GOAL_PLAN is not goal completion')
    expect(prompt).toContain('Never ask the user what to do next')
  })

  test('buildContinuationPrompt uses fallback progress when empty', async () => {
    const goal = await setGoal('Fresh goal')
    goal.progress_log = ''
    const prompt = buildContinuationPrompt(goal)
    expect(prompt).toContain('Initial exploration has begun')
  })

  test('buildContinuationPrompt uses actual progress log when present', async () => {
    const goal = await setGoal('Goal with progress')
    goal.progress_log = 'Completed step 1'
    const prompt = buildContinuationPrompt(goal)
    expect(prompt).toContain('Completed step 1')
  })

  test('buildContinuationPrompt includes advisory plan as non-authoritative context', async () => {
    const goal = await setGoal('Goal with plan')
    goal.advisory_plan = [
      { text: 'Inspect current behavior', status: 'done' },
      { text: 'Run verification', status: 'pending' },
    ]
    const prompt = buildContinuationPrompt(goal)
    expect(prompt).toContain('- [done] Inspect current behavior')
    expect(prompt).toContain('- [pending] Run verification')
    expect(prompt).toContain('Only the original objective, success criteria, and verification evidence decide completion')
  })

  test('parseGoalCompletionSignal requires concrete evidence section', () => {
    expect(parseGoalCompletionSignal('GOAL_COMPLETE\nReason: done')).toBeNull()
    expect(
      parseGoalCompletionSignal(
        'GOAL_COMPLETE\nReason: done\nEvidence: bun test passed\nRemaining risk: none known',
      ),
    ).toContain('Evidence: bun test passed')
  })

  test('parseGoalPlanSignal reads only explicit advisory plan blocks', () => {
    expect(parseGoalPlanSignal('- [done] checklist only')).toBeNull()
    expect(
      parseGoalPlanSignal(
        [
          'Continuing.',
          'GOAL_PLAN:',
          '- [done] Inspect current behavior',
          '- [in_progress] Patch the integration',
          '- [pending] Run focused tests',
          '',
          'Next: keep going.',
        ].join('\n'),
      ),
    ).toEqual([
      { status: 'done', text: 'Inspect current behavior' },
      { status: 'in_progress', text: 'Patch the integration' },
      { status: 'pending', text: 'Run focused tests' },
    ])
  })

  test('updateGoalAdvisoryPlanFromText persists plan without completing goal', async () => {
    await setGoal('Keep working until tests are green')
    await updateGoalAdvisoryPlanFromText(
      [
        'CONTINUE',
        'GOAL_PLAN:',
        '- [done] Finish checklist',
        '- [pending] Verify success criteria',
      ].join('\n'),
    )

    const goal = await loadGoal()
    expect(goal?.status).toBe('active')
    expect(goal?.advisory_plan).toEqual([
      { status: 'done', text: 'Finish checklist' },
      { status: 'pending', text: 'Verify success criteria' },
    ])
    expect(goal?.progress_log).toContain('[plan updated')
  })

  test('setGoal uses default success criteria when none provided', async () => {
    const goal = await setGoal('Silent goal', '')
    expect(goal.success_criteria).toContain('Silent goal')
    expect(goal.success_criteria).toContain('verifiably complete')
  })

  test('setGoal uses provided success criteria', async () => {
    const goal = await setGoal('Custom goal', 'All tests must pass and CI must be green')
    expect(goal.success_criteria).toBe('All tests must pass and CI must be green')
  })

  test('isGoalFeatureEnabled returns true by default', () => {
    expect(isGoalFeatureEnabled()).toBe(true)
  })

  test('goal feature can be disabled via env var', () => {
    const prev = process.env.OPENCLAUDE_DISABLE_GOALS
    process.env.OPENCLAUDE_DISABLE_GOALS = '1'
    try {
      expect(isGoalFeatureEnabled()).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.OPENCLAUDE_DISABLE_GOALS
      else process.env.OPENCLAUDE_DISABLE_GOALS = prev
    }
  })

  test('disabled goals prevent loadGoal', async () => {
    await setGoal('Should be hidden')
    const prev = process.env.OPENCLAUDE_DISABLE_GOALS
    process.env.OPENCLAUDE_DISABLE_GOALS = '1'
    try {
      const goal = await loadGoal()
      expect(goal).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.OPENCLAUDE_DISABLE_GOALS
      else process.env.OPENCLAUDE_DISABLE_GOALS = prev
    }
  })

  test('full lifecycle: set -> pause -> resume -> clear', async () => {
    const g1 = await setGoal('Full lifecycle test')
    expect(g1.status).toBe('active')

    const paused = await pauseGoal()
    expect(paused!.status).toBe('paused')

    const resumed = await resumeGoal()
    expect(resumed!.status).toBe('active')

    await clearGoal()
    const status = await goalStatus()
    expect(status).toBe('No active goal.')
  })

  test('status shows budget_limited state with token info', async () => {
    await setGoal('Budget test', '', 500)
    await accountGoalTokens(600)
    const status = await goalStatus()
    expect(status).toContain('budget_limited')
    expect(status).toContain('600/500')
  })

  test('status includes progress log when present', async () => {
    const goal = await setGoal('Progress goal')
    goal.progress_log = 'Step 1 done\nStep 2 done'
    goal.last_updated = new Date().toISOString()
    await saveGoal(goal, testEnv!.paths)
    const status = await goalStatus()
    expect(status).toContain('Step 1 done')
    expect(status).toContain('Step 2 done')
  })

  test('resumeGoal does nothing on an already-active goal', async () => {
    await setGoal('Active only')
    const result = await resumeGoal()
    expect(result!.status).toBe('active')
  })
})
