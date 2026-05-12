import { z } from 'zod'

export const GoalStatus = {
  active: 'active',
  paused: 'paused',
  complete: 'complete',
  budget_limited: 'budget_limited',
} as const

const goalPlanItemSchema = z.object({
  text: z.string().min(1),
  status: z
    .enum(['pending', 'in_progress', 'done', 'skipped', 'replaced'])
    .default('pending'),
})

const goalEvidenceSchema = z.object({
  summary: z.string().min(1),
  recorded_at: z.string(),
})

const goalCheckpointSchema = z.object({
  label: z.string().min(1),
  created_at: z.string(),
  message_id: z.string().optional(),
})

export const goalSchema = z.object({
  objective: z.string().min(1),
  success_criteria: z.string().default(''),
  advisory_plan: z.array(goalPlanItemSchema).default([]),
  verification_evidence: z.array(goalEvidenceSchema).default([]),
  checkpoints: z.array(goalCheckpointSchema).default([]),
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

Advisory plan/checklist: {advisory_plan}

Completion policy:

- The goal is NOT complete merely because a plan or checklist is complete.
- Plans are disposable working state. If the plan is exhausted but the success criteria are not verified, revise the plan and continue.
- Only the original objective, success criteria, and verification evidence decide completion.

Perform a completion audit:

1. List what has been accomplished so far.
2. Check every success criterion against the current codebase/tests/output.
3. Decide whether the original objective is verified complete, independent of the current checklist.

If COMPLETE: output exactly "GOAL_COMPLETE" followed by:
Reason: <short explanation>
Evidence: <commands, tests, files, or other concrete checks proving completion>
Remaining risk: <short note, or "none known">

If you cannot provide concrete Evidence, do not complete.

If CONTINUE: output a compact progress log and your next concrete actions (tools, edits, tests).
If you create or revise the advisory plan, include this exact machine-readable block:
GOAL_PLAN:
- [pending] <next action>
- [in_progress] <current action>
- [done] <completed action>

Only use statuses: pending, in_progress, done, skipped, replaced. A fully done GOAL_PLAN is not goal completion.

Never ask the user what to do next. Keep working autonomously until the goal is verifiably done or you hit a hard blocker.`
