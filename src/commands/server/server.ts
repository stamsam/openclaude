import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import { toString as qrToString } from 'qrcode'
import type {
  LocalCommandCall,
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { validateWorkspaceDir } from '../../telegram/workspace.js'
import {
  createMobileServerDeviceToken,
  getOrCreateMobileServerToken,
  resetMobileServerTokens,
} from '../../mobileServer/tokenStore.js'

type ServerAction =
  | 'start'
  | 'local'
  | 'status'
  | 'stop'
  | 'tailscale'
  | 'pair'
  | 'reset-token'
  | 'help'

export function parseServerAction(args: string): ServerAction {
  const normalized = args.trim().toLowerCase()
  if (!normalized || normalized === 'start' || normalized === 'on') return 'start'
  if (normalized === 'local' || normalized === 'loopback') return 'local'
  if (normalized === 'status' || normalized === 'info') return 'status'
  if (normalized === 'stop' || normalized === 'off') return 'stop'
  if (normalized === 'tailscale' || normalized === 'ts') return 'tailscale'
  if (normalized === 'pair' || normalized === 'new-token' || normalized === 'device') return 'pair'
  if (normalized === 'reset-token' || normalized === 'revoke') return 'reset-token'
  if (normalized === 'token') return 'pair'
  return 'help'
}

export function buildServerStatus(context: LocalJSXCommandContext): string {
  const state = context.getAppState()
  const enabled = state.mobileServerEnabled ?? false
  const connected = state.mobileServerConnected ?? false
  return [
    `Sam mobile server: ${enabled ? (connected ? 'on' : 'starting') : 'off'}`,
    state.mobileServerUrl ? `Local URL: ${redactToken(state.mobileServerUrl)}` : undefined,
    state.mobileServerTailscaleUrl
      ? `Tailscale URL: ${redactToken(state.mobileServerTailscaleUrl)}`
      : undefined,
    state.mobileServerWorkspaceDir
      ? `Workspace: ${state.mobileServerWorkspaceDir}`
      : undefined,
    state.mobileServerHost
      ? `Bind: ${state.mobileServerHost}:${state.mobileServerPort ?? 4097}`
      : undefined,
    state.mobileServerError ? `Last error: ${state.mobileServerError}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

export const call: LocalCommandCall = async (
  args,
  context,
): Promise<LocalCommandResult> => {
  const action = parseServerAction(args)

  if (action === 'help') {
    return {
      type: 'text',
      value: [
        'Usage: /server [local|status|stop|tailscale|pair|reset-token]',
        '',
        '/server starts a phone-friendly Sam companion UI on this Mac only.',
        '/server local forces a Mac-only loopback URL.',
        '/server tailscale exposes it on your Tailscale interface with token auth.',
        '/server pair creates a new device token without revoking existing paired devices.',
        '/server reset-token revokes existing mobile devices and creates a fresh token.',
        '/server stop turns it off for this session.',
      ].join('\n'),
    }
  }

  if (action === 'status') {
    return { type: 'text', value: buildServerStatus(context) }
  }

  if (
    action === 'start' &&
    context.getAppState().mobileServerEnabled &&
    !context.getAppState().mobileServerError
  ) {
    return {
      type: 'text',
      value: buildServerStatus(context),
    }
  }

  if (action === 'stop') {
    context.setAppState(prev => ({
      ...prev,
      mobileServerEnabled: false,
      mobileServerConnected: false,
      mobileServerError: undefined,
      mobileServerUrl: undefined,
      mobileServerTailscaleUrl: undefined,
    }))
    return { type: 'text', value: 'Sam mobile server stopped.' }
  }

  const token =
    action === 'reset-token'
      ? resetMobileServerTokens(createServerToken)
      : action === 'pair'
        ? createMobileServerDeviceToken(createServerToken)
        : context.getAppState().mobileServerToken ||
          getOrCreateMobileServerToken(createServerToken)
  const port = getRequestedPort()
  const workspace = getValidatedWorkspaceDir()
  const previousState = context.getAppState()
  const tailscaleHost = action === 'tailscale' ? detectTailscaleHost() : undefined
  const previousPhoneHost =
    previousState.mobileServerTailscaleHost ||
    (previousState.mobileServerHost &&
    previousState.mobileServerHost !== '127.0.0.1'
      ? previousState.mobileServerHost
      : undefined)
  const phoneHost =
    action === 'tailscale'
      ? tailscaleHost
      : action === 'pair'
        ? previousPhoneHost
        : undefined
  const usePhoneBind = !!phoneHost
  const host = usePhoneBind ? phoneHost : '127.0.0.1'
  const localBareUrl = `http://127.0.0.1:${port}/`
  const localUrl = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
  const formattedPhoneHost = formatUrlHost(phoneHost)
  const tailscaleBareUrl = formattedPhoneHost
    ? `http://${formattedPhoneHost}:${port}/`
    : undefined
  const tailscaleUrl = formattedPhoneHost
    ? `http://${formattedPhoneHost}:${port}/?token=${encodeURIComponent(token)}`
    : undefined
  const qrLines = tailscaleUrl ? await buildQrLines(tailscaleUrl) : []

  context.setAppState(prev => ({
    ...prev,
    mobileServerEnabled: true,
    mobileServerConnected: false,
    mobileServerError: undefined,
    mobileServerHost: host,
    mobileServerPort: port,
    mobileServerToken: token,
    mobileServerUrl: localBareUrl,
    mobileServerTailscaleUrl: usePhoneBind ? tailscaleBareUrl : undefined,
    mobileServerTailscaleHost: phoneHost,
    mobileServerWorkspaceDir: workspace,
    mobileServerConfigVersion: (prev.mobileServerConfigVersion ?? 0) + 1,
  }))

  return {
    type: 'text',
    value: [
      action === 'tailscale'
        ? 'Starting Sam mobile server for Tailscale.'
        : action === 'pair'
          ? 'Created a new Sam mobile device token.'
        : action === 'local'
          ? 'Starting Sam mobile server for this Mac only.'
        : action === 'reset-token'
          ? 'Revoked previous mobile device tokens and restarted Sam mobile server.'
          : 'Starting Sam mobile server for this Mac only.',
      '',
      `Local URL: ${localUrl}`,
      `Local bookmark after pairing: ${localBareUrl}`,
      usePhoneBind
        ? tailscaleUrl
          ? `Phone URL: ${tailscaleUrl}`
          : 'Tailscale URL: unavailable. Set TAILSCALE_IP or check `tailscale ip -4`.'
        : action === 'tailscale'
          ? 'Tailscale URL: unavailable. Set TAILSCALE_IP or check `tailscale ip -4`.'
        : action === 'start'
          ? 'Phone URL: off by default. Run `/server tailscale` when you want phone access.'
        : undefined,
      usePhoneBind && tailscaleBareUrl
        ? `Phone bookmark after pairing: ${tailscaleBareUrl}`
        : undefined,
      !usePhoneBind
        ? 'Phone setup: local URL only works on this Mac. Run `/server tailscale` for a scannable phone URL.'
        : undefined,
      qrLines.length > 0 ? '' : undefined,
      qrLines.length > 0 ? 'Pairing QR:' : undefined,
      ...qrLines,
      '',
      action === 'pair'
        ? 'Auth: open this tokenized URL once on the new device. After that, bookmark the bare Phone URL.'
        : 'Auth: paired devices keep a browser cookie; use /server pair for a new device.',
      'Mobile keys: Shift, Cmd, Alt, Ctrl, Esc, Tab, arrows, slash, and Enter are in the web UI.',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

async function buildQrLines(url: string): Promise<string[]> {
  try {
    const qr = await qrToString(url, {
      type: 'terminal',
      small: true,
      margin: 1,
    })
    return qr.split('\n').filter(line => line.length > 0)
  } catch {
    return []
  }
}

function createServerToken(): string {
  return `sam-${randomBytes(18).toString('base64url')}`
}

function redactToken(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', 'redacted')
    }
    return parsed.toString()
  } catch {
    return url.replace(/([?&]token=)[^&\s]+/g, '$1redacted')
  }
}

function getRequestedPort(): number {
  const raw = process.env.OPENCLAUDE_MOBILE_SERVER_PORT?.trim()
  if (!raw) return 4097
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return 4097
  return port
}

function getValidatedWorkspaceDir(): string {
  const cwd = getCwd()
  try {
    return validateWorkspaceDir(cwd)
  } catch (primaryError) {
    const processCwd = process.cwd()
    if (processCwd !== cwd) {
      try {
        return validateWorkspaceDir(processCwd)
      } catch {
        // Keep the original error because it points at the app-level cwd state.
      }
    }
    throw primaryError
  }
}

function detectTailscaleHost(): string | undefined {
  const fromEnv = process.env.TAILSCALE_IP?.trim()
  if (fromEnv) return isLikelyIpAddress(fromEnv) ? fromEnv : undefined
  try {
    const output = execFileSync('tailscale', ['ip', '-4'], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split(/\s+/).find(isLikelyIpAddress)
  } catch {
    return undefined
  }
}

function isLikelyIpAddress(value: string | undefined): value is string {
  if (!value) return false
  if (value.includes(':')) return /^[0-9a-f:]+$/i.test(value)
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

function formatUrlHost(host: string | undefined): string | undefined {
  if (!host) return undefined
  return host.includes(':') ? `[${host}]` : host
}
