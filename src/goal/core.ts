import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { goalSchema, type GoalState, CONTINUATION_PROMPT, GoalStatus } from './schema.js'
import { getGoalPaths } from './paths.js'

function nowIso(): string {
  return new Date().toISOString()
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function isGoalFeatureEnabled(): boolean {
  if (process.env.OPENCLAUDE_DISABLE_GOALS === '1') return false
  return true
}

export async function ensureGoalStorage(): Promise<void> {
  const paths = getGoalPaths()
  await mkdir(paths.home, { recursive: true })
}

export async function loadGoal(): Promise<GoalState | null> {
  if (!isGoalFeatureEnabled()) return null
  const paths = getGoalPaths()
  try {
    const raw = await readFile(paths.stateFile, 'utf8')
    return goalSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveGoal(goal: GoalState): Promise<void> {
  const paths = getGoalPaths()
  await ensureGoalStorage()
  await writeFile(paths.stateFile, `${JSON.stringify(goal, null, 2)}\n`)
}

export async function setGoal(
  objective: string,
  successCriteria: string = '',
  tokenBudget?: number,
): Promise<GoalState> {
  const goal: GoalState = {
    objective,
    success_criteria: successCriteria || `Verify that "${objective}" is verifiably complete.`,
    status: 'active',
    progress_log: '',
    start_time: nowIso(),
    last_updated: nowIso(),
    token_budget: tokenBudget && tokenBudget > 0 ? tokenBudget : undefined,
    tokens_used: 0,
    time_used_seconds: 0,
  }
  await saveGoal(goal)
  return goal
}

export async function clearGoal(): Promise<void> {
  const paths = getGoalPaths()
  try {
    await writeFile(paths.stateFile, '')
  } catch {
    // file may not exist
  }
}

export async function pauseGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  goal.status = 'paused'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  return goal
}

export async function resumeGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'paused') return goal
  goal.status = 'active'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  return goal
}

export async function accountGoalTokens(tokens: number): Promise<void> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return
  goal.tokens_used += tokens
  goal.time_used_seconds = Math.max(0, nowSeconds() - Math.floor(new Date(goal.start_time).getTime() / 1000))
  goal.last_updated = nowIso()

  // Check budget
  if (goal.token_budget && goal.tokens_used >= goal.token_budget) {
    goal.status = 'budget_limited'
    goal.progress_log += `\n[budget exhausted at ${nowIso()}: ${goal.tokens_used}/${goal.token_budget} tokens]`
  }

  await saveGoal(goal)
}

export async function goalStatus(): Promise<string> {
  const goal = await loadGoal()
  if (!goal) return 'No active goal.'
  const elapsed = Date.now() - new Date(goal.start_time).getTime()
  const hours = Math.floor(elapsed / 3600000)
  const minutes = Math.floor((elapsed % 3600000) / 60000)
  const seconds = Math.floor((elapsed % 60000) / 1000)
  const elapsedStr = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`
  const statusIcon =
    goal.status === 'active' ? '?' :
    goal.status === 'paused' ? '?' :
    goal.status === 'budget_limited' ? '?' :
    '?'
  const budgetInfo = goal.token_budget
    ? ` (${goal.tokens_used}/${goal.token_budget} tokens)`
    : ''
  return [
    `Goal ${statusIcon} [${goal.status}]`,
    `Objective: ${goal.objective}`,
    `Success criteria: ${goal.success_criteria}`,
    `Elapsed: ${elapsedStr}${budgetInfo}`,
    `Tokens used: ${goal.tokens_used}`,
    goal.progress_log ? `\nProgress:\n${goal.progress_log}` : '',
  ].filter(Boolean).join('\n')
}

export function buildContinuationPrompt(goal: GoalState): string {
  return CONTINUATION_PROMPT
    .replace('{objective}', goal.objective)
    .replace('{progress_summary}', goal.progress_log || 'Initial exploration has begun.')
    .replace('{verifiable_end_state}', goal.success_criteria)
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

export async function ensureGoalStorage(): Promise<void> {
  const paths = getGoalPaths()
  await mkdir(paths.home, { recursive: true })
}

export async function loadGoal(): Promise<GoalState | null> {
  const paths = getGoalPaths()
  try {
    const raw = await readFile(paths.stateFile, 'utf8')
    return goalSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveGoal(goal: GoalState): Promise<void> {
  const paths = getGoalPaths()
  await ensureGoalStorage()
  await writeFile(paths.stateFile, `${JSON.stringify(goal, null, 2)}\n`)
}

export async function setGoal(objective: string, successCriteria: string = ''): Promise<GoalState> {
  const goal: GoalState = {
    objective,
    success_criteria: successCriteria || `Verify that "${objective}" is verifiably complete.`,
    status: 'active',
    progress_log: '',
    start_time: nowIso(),
    last_updated: nowIso(),
    token_budget_used: 0,
    tokens_used: 0,
  }
  await saveGoal(goal)
  return goal
}

export async function clearGoal(): Promise<void> {
  const paths = getGoalPaths()
  try {
    await writeFile(paths.stateFile, '')
  } catch {
    // file may not exist
  }
}

export async function pauseGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  goal.status = 'paused'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  return goal
}

export async function resumeGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'paused') return goal
  goal.status = 'active'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  return goal
}

export async function goalStatus(): Promise<string> {
  const goal = await loadGoal()
  if (!goal) return 'No active goal.'
  const elapsed = Date.now() - new Date(goal.start_time).getTime()
  const hours = Math.floor(elapsed / 3600000)
  const minutes = Math.floor((elapsed % 3600000) / 60000)
  const seconds = Math.floor((elapsed % 60000) / 1000)
  const elapsedStr = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`
  const statusIcon = goal.status === 'active' ? '▶' : goal.status === 'paused' ? '⏸' : '✓'
  return [
    `Goal ${statusIcon} [${goal.status}]`,
    `Objective: ${goal.objective}`,
    `Success criteria: ${goal.success_criteria}`,
    `Elapsed: ${elapsedStr}`,
    `Tokens used: ${goal.tokens_used}`,
    goal.progress_log ? `\nProgress:\n${goal.progress_log}` : '',
  ].filter(Boolean).join('\n')
}

export function buildContinuationPrompt(goal: GoalState): string {
  return CONTINUATION_PROMPT
    .replace('{objective}', goal.objective)
    .replace('{progress_summary}', goal.progress_log || 'Initial exploration has begun.')
    .replace('{verifiable_end_state}', goal.success_criteria)
}
