import { validateWorkspaceDir } from '../../telegram/workspace.js'
import {
  getSavedTelegramSettings,
  resolveTelegramSetting,
} from '../../telegram/settings.js'
import {
  formatTelegramTaskVisibility,
  type TelegramTaskVisibilityItem,
} from '../../telegram/taskVisibility.js'

export type TelegramSlashAction =
  | { kind: 'toggle' }
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'status' }
  | { kind: 'setup' }
  | { kind: 'help' }

export function parseTelegramSlashArgs(args: string): TelegramSlashAction {
  const normalized = args.trim().toLowerCase()
  if (!normalized) return { kind: 'toggle' }
  if (normalized === 'on' || normalized === 'start') return { kind: 'on' }
  if (normalized === 'off' || normalized === 'stop') return { kind: 'off' }
  if (normalized === 'status') return { kind: 'status' }
  if (normalized === 'setup' || normalized === 'config') return { kind: 'setup' }
  return { kind: 'help' }
}

export function canEnableTelegramFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const saved = safeGetSavedTelegramSettings()
  return Boolean(
    resolveTelegramSetting(env.TELEGRAM_BOT_TOKEN, saved?.botToken) &&
      resolveTelegramSetting(
        env.TELEGRAM_ALLOWED_USER_ID,
        saved?.allowedUserId,
      ),
  )
}

export function getTelegramWorkspaceForSession(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured =
    env.OPENCLAUDE_WORKSPACE_DIR?.trim() || env.WORKSPACE_DIR?.trim() || cwd
  return validateWorkspaceDir(configured)
}

export function buildTelegramSessionStatus(params: {
  enabled: boolean
  connected: boolean
  paused: boolean
  workspace: string
  error?: string
  taskSummary?: string
}): string {
  return [
    `Telegram bridge: ${params.enabled ? (params.connected ? 'on' : 'starting') : 'off'}`,
    `Paused: ${params.paused ? 'yes' : 'no'}`,
    `Workspace: ${params.workspace}`,
    params.taskSummary,
    params.error ? `Last error: ${params.error}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildTelegramSetupGuide(params: {
  cwd: string
  env?: NodeJS.ProcessEnv
  enabled?: boolean
  connected?: boolean
}): string {
  const env = params.env ?? process.env
  const saved = params.env ? undefined : safeGetSavedTelegramSettings()
  const tokenSet = Boolean(
    resolveTelegramSetting(env.TELEGRAM_BOT_TOKEN, saved?.botToken),
  )
  const userSet = Boolean(
    resolveTelegramSetting(
      env.TELEGRAM_ALLOWED_USER_ID,
      saved?.allowedUserId,
    ),
  )
  let workspace: string
  try {
    workspace = getTelegramWorkspaceForSession(params.cwd, env)
  } catch {
    workspace = params.cwd
  }

  return [
    'Telegram setup',
    '',
    '1. Create a bot with @BotFather and copy the bot token.',
    `   TELEGRAM_BOT_TOKEN: ${tokenSet ? 'set' : 'missing'}`,
    '',
    '2. Find your numeric Telegram user ID and allow only that account.',
    `   TELEGRAM_ALLOWED_USER_ID: ${userSet ? 'set' : 'missing'}`,
    '',
    '3. Pick the workspace this session should use.',
    `   Workspace: ${workspace}`,
    '',
    '4. Export these vars before launching OpenClaude:',
    `   export TELEGRAM_BOT_TOKEN="${tokenSet ? '<set>' : 'YOUR_BOT_TOKEN'}"`,
    `   export TELEGRAM_ALLOWED_USER_ID="${userSet ? '<set>' : 'YOUR_NUMERIC_USER_ID'}"`,
    `   export OPENCLAUDE_WORKSPACE_DIR="${workspace}"`,
    '',
    '5. In this session, run /telegram to turn the bridge on.',
    '',
    'Telegram bot commands:',
    '  /status',
    '  /tasks',
    '  /pause',
    '  /resume',
    '  /stop',
    '  /dismiss',
    '  /ask <prompt>',
    '  /btw <prompt>',
    '  /model',
    '',
    'Notes:',
    '- /btw is Telegram-native: it replies in Telegram and does not open the local modal.',
    '- /dismiss only closes the active local OpenClaude overlay; it does not cancel normal work.',
    '- This first in-session version sends the final reply back to Telegram after the turn completes.',
  ].join('\n')
}

export function buildTelegramSessionTaskSummary(
  tasks: Record<string, TelegramSessionTaskLike> | undefined,
): string {
  const taskItems = Object.entries(tasks ?? {}).map(([taskId, task]) => ({
    id: task.id || taskId,
    status: task.status || 'unknown',
    subject: task.description || task.type || 'Task',
  }))

  return formatTelegramTaskVisibility(taskItems, {
    heading: 'Tasks',
    maxItems: 5,
  })
}

function safeGetSavedTelegramSettings() {
  try {
    return getSavedTelegramSettings()
  } catch {
    return undefined
  }
}

type TelegramSessionTaskLike = Partial<TelegramTaskVisibilityItem> & {
  description?: string
  type?: string
}
