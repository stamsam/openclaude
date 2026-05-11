import { validateWorkspaceDir } from './workspace.js'
import { getSavedTelegramSettings, resolveTelegramSetting } from './settings.js'
import type { TelegramBridgeConfig } from './types.js'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function parsePort(raw: string): number {
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid gRPC port: ${raw}`)
  }
  return port
}

export function redactSecret(_value: string): string {
  return '<redacted>'
}

export function describeTelegramBridgeConfig(
  config: TelegramBridgeConfig,
): string {
  return [
    'Telegram bridge configuration:',
    `- allowed user: ${config.allowedUserId}`,
    `- gRPC target: ${config.grpcHost}:${config.grpcPort}`,
    `- workspace: ${config.workspaceDir}`,
    `- bot token: ${redactSecret(config.botToken)}`,
  ].join('\n')
}

export function loadTelegramBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramBridgeConfig {
  const saved = getSavedTelegramSettings()
  const botToken = readRequiredValue(
    resolveTelegramSetting(env.TELEGRAM_BOT_TOKEN, saved?.botToken),
    'TELEGRAM_BOT_TOKEN',
  )
  const allowedUserId = readRequiredValue(
    resolveTelegramSetting(
      env.TELEGRAM_ALLOWED_USER_ID,
      saved?.allowedUserId,
    ),
    'TELEGRAM_ALLOWED_USER_ID',
  )
  const workspaceRaw =
    env.OPENCLAUDE_WORKSPACE_DIR?.trim() || env.WORKSPACE_DIR?.trim()
  if (!workspaceRaw) {
    throw new Error('Missing required workspace for Telegram bridge. Set OPENCLAUDE_WORKSPACE_DIR or WORKSPACE_DIR.')
  }

  const grpcHost =
    env.OPENCLAUDE_GRPC_HOST?.trim() ||
    env.GRPC_HOST?.trim() ||
    '127.0.0.1'
  const grpcPort = parsePort(
    env.OPENCLAUDE_GRPC_PORT?.trim() || env.GRPC_PORT?.trim() || '50051',
  )
  const unsafeGrpcAllowed = isTruthy(env.OPENCLAUDE_ALLOW_UNSAFE_GRPC)

  if (grpcHost === '0.0.0.0' && !unsafeGrpcAllowed) {
    throw new Error(
      'Refusing to use 0.0.0.0 as gRPC target without OPENCLAUDE_ALLOW_UNSAFE_GRPC=1',
    )
  }

  if (!LOOPBACK_HOSTS.has(grpcHost) && !unsafeGrpcAllowed) {
    throw new Error(
      `Refusing to use non-loopback gRPC target "${grpcHost}" without OPENCLAUDE_ALLOW_UNSAFE_GRPC=1`,
    )
  }

  return {
    botToken,
    allowedUserId,
    grpcHost,
    grpcPort,
    workspaceDir: validateWorkspaceDir(workspaceRaw),
    unsafeGrpcAllowed,
  }
}

function readRequiredValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing required Telegram setting: ${name}. Set it in the environment or run /telegram setup.`,
    )
  }
  return value
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}
