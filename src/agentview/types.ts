export const AGENT_VIEW_STATUSES = [
  'needs_input',
  'working',
  'idle',
  'completed',
  'failed',
  'stopped',
] as const

export type AgentViewStatus = (typeof AGENT_VIEW_STATUSES)[number]

export type BackgroundJob = {
  id: string
  session_id: string
  name: string
  prompt: string
  prompt_summary: string
  cwd: string
  branch?: string
  provider?: string
  model?: string
  agent?: string
  permission_mode?: string
  status: AgentViewStatus
  created_at: string
  updated_at: string
  pid?: number
  exit_code?: number | null
  signal?: string | null
  worktree_path?: string
  worktree_branch?: string
  respawn_of?: string
  latest_output_tail?: string
  input_needed?: boolean
}

export type CreateBackgroundJobOptions = {
  prompt: string
  cwd: string
  provider?: string
  model?: string
  agent?: string
  permissionMode?: string
  name?: string
  useWorktree?: boolean
  respawnOf?: string
}

export type LaunchBackgroundJobOptions = {
  provider?: string
  model?: string
  agent?: string
  permissionMode?: string
}

export type InboxGroup = 'needs_decision' | 'running' | 'ready' | 'done'

export type HandoffAction = 'view_diff' | 'apply' | 'reply' | 'respawn' | 'archive'

export type InboxCard = {
  job: BackgroundJob
  group: InboxGroup
  summaryLine: string
  findings?: string
  changedFiles?: string[]
  testsRun?: string
  riskLevel?: 'low' | 'medium' | 'high'
  actions: HandoffAction[]
}
