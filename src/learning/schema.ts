import { z } from 'zod'

export const learnQueueItemSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  created_at: z.string().min(1),
  candidate_type: z.enum(['memory', 'user_memory', 'skill', 'cleanup', 'note']),
  confidence: z.enum(['low', 'medium', 'high']),
  proposed_text: z.string().min(1),
  evidence_summary: z.string().min(1),
  status: z.enum(['pending', 'applied', 'archived', 'rejected']),
  target: z.string().min(1),
  sensitive: z.boolean(),
  observed_at: z.string().optional(),
  revalidate_after: z.string().optional(),
  repeat_count: z.number().int().nonnegative().optional(),
})

export type LearnQueueItem = z.infer<typeof learnQueueItemSchema>

export const skillJsonSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  source: z.literal('learn'),
  confidence: z.enum(['low', 'medium', 'high']),
  usage_count: z.number().int().nonnegative(),
  last_used_at: z.string(),
  pinned: z.boolean(),
  status: z.enum(['active', 'stale', 'archived']),
})

export type LearnedSkillJson = z.infer<typeof skillJsonSchema>
