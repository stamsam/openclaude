import { decodeJwtPayload } from './codexOAuthShared.js'

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai'
export const XAI_OAUTH_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth/token`
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
export const XAI_OAUTH_SCOPE =
  'openid profile email offline_access grok-cli:access api:access'
export const XAI_OAUTH_REDIRECT_HOST = '127.0.0.1'
export const XAI_OAUTH_REDIRECT_PORT = 56121
export const XAI_OAUTH_REDIRECT_PATH = '/callback'
export const XAI_OAUTH_BASE_URL = 'https://api.x.ai/v1'
export const XAI_OAUTH_DEFAULT_MODEL = 'grok-4.3'

export function getXaiOAuthCallbackPort(): number {
  const value = Number.parseInt(
    process.env.XAI_OAUTH_CALLBACK_PORT ?? '',
    10,
  )
  return Number.isFinite(value) && value > 0
    ? value
    : XAI_OAUTH_REDIRECT_PORT
}

export function buildXaiOAuthRedirectUri(port: number): string {
  return `http://${XAI_OAUTH_REDIRECT_HOST}:${port}${XAI_OAUTH_REDIRECT_PATH}`
}

export function parseXaiTokenExpiryMs(
  token: string | undefined,
): number | undefined {
  if (!token) return undefined
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' && Number.isFinite(exp)
    ? exp * 1000
    : undefined
}

export function coerceXaiExpiresAtMs(
  expiresInSeconds: unknown,
  fallbackToken?: string,
  now = Date.now(),
): number | undefined {
  if (
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
  ) {
    return now + expiresInSeconds * 1000
  }
  return parseXaiTokenExpiryMs(fallbackToken)
}
