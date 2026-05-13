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
  return new Date(Date.now()).toISOString()
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function secondsFromIso(value: string | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.floor(time / 1000)
}

function settleRuntimeTime(goal: GoalState, now = nowSeconds()): GoalState {
  const activeStarted = secondsFromIso(goal.active_session_started_at)
  if (goal.status !== 'active' || activeStarted === null) {
    return goal
  }
  const delta = Math.max(0, now - activeStarted)
  goal.time_used_seconds = Math.max(0, goal.time_used_seconds + delta)
  goal.active_session_started_at = new Date(now * 1000).toISOString()
  return goal
}

function clearRuntimeSession(goal: GoalState): GoalState {
  goal.active_session_started_at = undefined
  return goal
}

export function getGoalElapsedSeconds(goal: GoalState): number {
  if (goal.status !== 'active') {
    return goal.time_used_seconds
  }
  const activeStarted = secondsFromIso(goal.active_session_started_at)
  if (activeStarted === null) {
    return goal.time_used_seconds
  }
  return Math.max(0, goal.time_used_seconds + nowSeconds() - activeStarted)
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

export function parseGoalPlanSignal(
  text: string,
): GoalState['advisory_plan'] | null {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^GOAL_PLAN\s*:\s*$/i.test(line.trim()))
  if (start === -1) return null

  const items: GoalState['advisory_plan'] = []
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (items.length > 0) break
      continue
    }
    if (/^[A-Z][A-Z_ ]+\s*:/.test(trimmed) && items.length > 0) break

    const match = trimmed.match(
      /^[-*]\s*\[(pending|in_progress|done|skipped|replaced)\]\s+(.+)$/i,
    )
    if (!match) continue
    const status = match[1]!.toLowerCase() as GoalState['advisory_plan'][number]['status']
    const itemText = match[2]!.trim()
    if (itemText) {
      items.push({ status, text: itemText })
    }
  }

  return items.length > 0 ? items : null
}

export async function updateGoalAdvisoryPlanFromText(
  text: string,
): Promise<GoalState | null> {
  const nextPlan = parseGoalPlanSignal(text)
  if (!nextPlan) return null
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal

  goal.advisory_plan = nextPlan
  goal.last_updated = nowIso()
  goal.progress_log += `\n[plan updated at ${goal.last_updated}: ${nextPlan.length} item${nextPlan.length === 1 ? '' : 's'}]`
  await saveGoal(goal)
  emitOpenClaudeEvent({
    type: 'goal.plan',
    objective: goal.objective,
    at: goal.last_updated,
  })
  return goal
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
  settleRuntimeTime(goal)
  goal.status = 'paused'
  goal.active_session_started_at = undefined
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
  settleRuntimeTime(goal)
  goal.status = 'complete'
  goal.last_updated = nowIso()
  goal.active_session_started_at = undefined
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
  settleRuntimeTime(goal)
  goal.tokens_used += tokens
  goal.last_updated = nowIso()
  if (goal.token_budget && goal.tokens_used >= goal.token_budget) {
    goal.status = 'budget_limited'
    goal.active_session_started_at = undefined
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

export async function beginGoalRuntimeSession(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  goal.active_session_started_at = nowIso()
  await saveGoal(goal)
  return goal
}

export async function heartbeatGoalRuntimeSession(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  if (!goal.active_session_started_at) return goal
  settleRuntimeTime(goal)
  await saveGoal(goal)
  return goal
}

export async function endGoalRuntimeSession(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active') return goal
  if (!goal.active_session_started_at) return goal
  settleRuntimeTime(goal)
  goal.active_session_started_at = undefined
  await saveGoal(goal)
  return goal
}

export async function discardGoalRuntimeSession(): Promise<GoalState | null> {
  const goal = await loadGoal()
  if (!goal || goal.status !== 'active' || !goal.active_session_started_at) {
    return goal
  }
  clearRuntimeSession(goal)
  await saveGoal(goal)
  return goal
}

export async function goalStatus(): Promise<string> {
  const goal = await loadGoal()
  if (!goal) return 'No active goal.'
  const elapsed = getGoalElapsedSeconds(goal)
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = Math.floor(elapsed % 60)
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
