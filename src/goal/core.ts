import { mkdir, readFile, writeFile } from 'fs/promises'
import { goalSchema, type GoalState, CONTINUATION_PROMPT } from './schema.js'
import { getGoalPaths } from './paths.js'

let memoryCache: { goal: GoalState; timestamp: number } | null = null
const CACHE_TTL_MS = 200

export function resetGoalMemoryCache(): void {
  memoryCache = null
}

function nowIso(): string {
  return new Date().toISOString()
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function isGoalFeatureEnabled(): boolean {
  return process.env.OPENCLAUDE_DISABLE_GOALS !== '1'
}

export async function ensureGoalStorage(): Promise<void> {
  await mkdir(getGoalPaths().home, { recursive: true })
}

export async function loadGoal(): Promise<GoalState | null> {
  if (!isGoalFeatureEnabled()) return null
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache.goal
  }
  try {
    const raw = await readFile(getGoalPaths().stateFile, 'utf8')
    if (!raw.trim()) {
      memoryCache = null
      return null
    }
    const goal = goalSchema.parse(JSON.parse(raw))
    memoryCache = { goal, timestamp: Date.now() }
    return goal
  } catch {
    memoryCache = null
    return null
  }
}

export async function saveGoal(
  goal: GoalState,
  pathsOverride?: ReturnType<typeof getGoalPaths>,
): Promise<void> {
  const paths = pathsOverride || getGoalPaths()
  await mkdir(paths.home, { recursive: true })
  await writeFile(paths.stateFile, `${JSON.stringify(goal, null, 2)}\n`)
  memoryCache = { goal, timestamp: Date.now() }
}

export async function setGoal(
  objective: string,
  successCriteria: string = '',
  tokenBudget?: number,
): Promise<GoalState> {
  const goal: GoalState = {
    objective,
    success_criteria:
      successCriteria || `Verify that "${objective}" is verifiably complete.`,
    status: 'active',
    progress_log: '',
    start_time: nowIso(),
    last_updated: nowIso(),
    token_budget: tokenBudget && tokenBudget > 0 ? tokenBudget : undefined,
    tokens_used: 0,
    time_used_seconds: 0,
  }
  await ensureGoalStorage()
  await saveGoal(goal)
  return goal
}

export async function clearGoal(): Promise<void> {
  memoryCache = null
  try {
    await writeFile(getGoalPaths().stateFile, '')
  } catch {}
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
  goal.time_used_seconds = Math.max(
    0,
    nowSeconds() - Math.floor(new Date(goal.start_time).getTime() / 1000),
  )
  goal.last_updated = nowIso()
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
  const h = Math.floor(elapsed / 3600000)
  const m = Math.floor((elapsed % 3600000) / 60000)
  const s = Math.floor((elapsed % 60000) / 1000)
  const elapsedStr =
    h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
  const icon =
    goal.status === 'active'
      ? '?'
      : goal.status === 'paused'
        ? '?'
        : goal.status === 'budget_limited'
          ? '?'
          : '?'
  const budget = goal.token_budget
    ? ` (${goal.tokens_used}/${goal.token_budget} tokens)`
    : ''
  return [
    `Goal ${icon} [${goal.status}]`,
    `Objective: ${goal.objective}`,
    `Success criteria: ${goal.success_criteria}`,
    `Elapsed: ${elapsedStr}${budget}`,
    `Tokens used: ${goal.tokens_used}`,
    goal.progress_log ? `\nProgress:\n${goal.progress_log}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildContinuationPrompt(goal: GoalState): string {
  if (!goal?.objective) return ''
  return CONTINUATION_PROMPT.replace('{objective}', goal.objective)
    .replace(
      '{progress_summary}',
      goal.progress_log || 'Initial exploration has begun.',
    )
    .replace('{verifiable_end_state}', goal.success_criteria || '')
}
