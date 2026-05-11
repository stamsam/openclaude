import { z } from 'zod'

export const GoalStatus = {
  active: 'active',
  paused: 'paused',
  complete: 'complete',
  budget_limited: 'budget_limited',
} as const

export const goalSchema = z.object({
  objective: z.string().min(1),
  success_criteria: z.string().default(''),
  status: z.enum(['active', 'paused', 'complete', 'budget_limited']),
  progress_log: z.string().default(''),
  start_time: z.string(),
  last_updated: z.string(),
  token_budget: z.number().int().positive().optional(),
  tokens_used: z.number().int().nonnegative().default(0),
  time_used_seconds: z.number().int().nonnegative().default(0),
})

export type GoalState = z.infer<typeof goalSchema>

export const CONTINUATION_PROMPT = `You have an active goal: "{objective}"

Current status: {progress_summary}

Success criteria: {verifiable_end_state}

Perform a completion audit:

1. List what has been accomplished so far.
2. Check every success criterion against the current codebase/tests/output.
3. Decide: CONTINUE or COMPLETE.

If COMPLETE: output exactly "GOAL_COMPLETE" followed by a short explanation. Do not do more work.

If CONTINUE: output a compact progress log + your next concrete actions (tools, edits, tests).

Never ask the user what to do next. Keep working autonomously until the goal is verifiably done or you hit a hard blocker.`
