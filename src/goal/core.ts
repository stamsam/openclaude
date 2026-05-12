import { mkdir, readFile, writeFile } from 'fs/promises'
import { goalSchema, type GoalState, CONTINUATION_PROMPT } from './schema.js'
import { getGoalPaths } from './paths.js'
import { emitOpenClaudeEvent } from '../events/openclaudeEvents.js'

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

export function parseGoalCompletionSignal(text: string): string | null {
  const match = text.trim().match(/^GOAL_COMPLETE\b\s*([\s\S]*)$/)
  if (!match) return null
  const details = match[1]?.trim() ?? ''
  if (!/\bEvidence\s*:/i.test(details)) return null
  return details
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
    advisory_plan: [],
    verification_evidence: [],
    checkpoints: [],
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
  emitOpenClaudeEvent({
    type: 'goal.set',
    objective: goal.objective,
    at: goal.last_updated,
  })
  return goal
}

export async function clearGoal(): Promise<void> {
  const goal = await loadGoal()
  memoryCache = null
  try {
    await writeFile(getGoalPaths().stateFile, '')
  } catch {}
  emitOpenClaudeEvent({
    type: 'goal.clear',
    objective: goal?.objective,
    at: nowIso(),
  })
}

export async function pauseGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  goal.status = 'paused'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  emitOpenClaudeEvent({
    type: 'goal.pause',
    objective: goal.objective,
    at: goal.last_updated,
  })
  return goal
}

export async function resumeGoal(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'paused') return goal
  goal.status = 'active'
  goal.last_updated = nowIso()
  await saveGoal(goal)
  emitOpenClaudeEvent({
    type: 'goal.resume',
    objective: goal.objective,
    at: goal.last_updated,
  })
  return goal
}

export async function completeGoal(reason = ''): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  goal.status = 'complete'
  goal.last_updated = nowIso()
  goal.time_used_seconds = Math.max(
    0,
    nowSeconds() - Math.floor(new Date(goal.start_time).getTime() / 1000),
  )
  goal.progress_log += `\n[completed at ${nowIso()}${reason ? `: ${reason}` : ''}]`
  await saveGoal(goal)
  emitOpenClaudeEvent({
    type: 'goal.complete',
    objective: goal.objective,
    at: goal.last_updated,
  })
  return goal
}

export async function recordGoalCheckpoint(
  label: string,
  messageId?: string,
): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  const checkpoint = {
    label: label.trim() || 'manual checkpoint',
    created_at: nowIso(),
    ...(messageId ? { message_id: messageId } : {}),
  }
  goal.checkpoints.push(checkpoint)
  goal.last_updated = checkpoint.created_at
  goal.progress_log += `\n[checkpoint at ${checkpoint.created_at}: ${checkpoint.label}]`
  await saveGoal(goal)
  emitOpenClaudeEvent({
    type: 'goal.checkpoint',
    objective: goal.objective,
    label: checkpoint.label,
    at: checkpoint.created_at,
  })
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
  emitOpenClaudeEvent({
    type: 'goal.tokens',
    objective: goal.objective,
    tokensUsed: goal.tokens_used,
    at: goal.last_updated,
  })
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
      ? 'ACTIVE'
      : goal.status === 'paused'
        ? 'PAUSED'
        : goal.status === 'budget_limited'
          ? 'BUDGET'
          : 'DONE'
  const budget = goal.token_budget
    ? ` (${goal.tokens_used}/${goal.token_budget} tokens)`
    : ''
  const plan =
    goal.advisory_plan.length > 0
      ? goal.advisory_plan
          .map(item => `- [${item.status}] ${item.text}`)
          .join('\n')
      : ''
  const evidence =
    goal.verification_evidence.length > 0
      ? goal.verification_evidence
          .map(item => `- ${item.summary}`)
          .join('\n')
      : ''
  const checkpoints =
    goal.checkpoints.length > 0
      ? goal.checkpoints
          .slice(-5)
          .map(item => `- ${item.created_at}: ${item.label}`)
          .join('\n')
      : ''
  return [
    `Goal ${icon} [${goal.status}]`,
    `Objective: ${goal.objective}`,
    `Success criteria: ${goal.success_criteria}`,
    `Elapsed: ${elapsedStr}${budget}`,
    `Tokens used: ${goal.tokens_used}`,
    plan ? `\nAdvisory plan:\n${plan}` : '',
    evidence ? `\nVerification evidence:\n${evidence}` : '',
    checkpoints ? `\nCheckpoints:\n${checkpoints}` : '',
    '\nUseful commands: /goal plan, /goal act, /goal checkpoint, /goal restore, /goal tasks, /goal pause, /goal clear',
    goal.progress_log ? `\nProgress:\n${goal.progress_log}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildContinuationPrompt(goal: GoalState): string {
  if (!goal?.objective) return ''
  const advisoryPlan =
    goal.advisory_plan.length > 0
      ? goal.advisory_plan
          .map(item => `- [${item.status}] ${item.text}`)
          .join('\n')
      : 'No durable plan has been recorded yet. Create or revise an advisory plan only as needed; do not treat it as completion criteria.'
  return CONTINUATION_PROMPT.replace('{objective}', goal.objective)
    .replace(
      '{progress_summary}',
      goal.progress_log || 'Initial exploration has begun.',
    )
    .replace('{verifiable_end_state}', goal.success_criteria || '')
    .replace('{advisory_plan}', advisoryPlan)
}
