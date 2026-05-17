import { isBareMode } from './envUtils.js'
import { getSecureStorage } from './secureStorage/index.js'
import {
  coerceXaiExpiresAtMs,
  parseXaiTokenExpiryMs,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_TOKEN_URL,
} from '../services/api/xaiOAuthShared.js'

export const XAI_OAUTH_STORAGE_KEY = 'xaiOAuth' as const
const REFRESH_SKEW_MS = 120_000
const REFRESH_FAILURE_COOLDOWN_MS = 60_000

export type XaiOAuthCredentialBlob = {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt?: number
  scope?: string
  profileId?: string
  lastRefreshAt?: number
  lastRefreshFailureAt?: number
}

type XaiTokenRefreshResponse = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
}

let inFlightRefresh:
  | Promise<{ refreshed: boolean; credentials?: XaiOAuthCredentialBlob }>
  | null = null
let inMemoryLastRefreshFailureAt: number | null = null

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getXaiSecureStorage() {
  return getSecureStorage({ allowPlainTextFallback: false })
}

function normalizeXaiOAuthCredentialBlob(
  value: unknown,
): XaiOAuthCredentialBlob | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const accessToken = asTrimmedString(record.accessToken)
  if (!accessToken) return undefined
  const expiresAt =
    typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
      ? record.expiresAt
      : parseXaiTokenExpiryMs(accessToken)
  const lastRefreshAt =
    typeof record.lastRefreshAt === 'number' && Number.isFinite(record.lastRefreshAt)
      ? record.lastRefreshAt
      : undefined
  const lastRefreshFailureAt =
    typeof record.lastRefreshFailureAt === 'number' &&
    Number.isFinite(record.lastRefreshFailureAt)
      ? record.lastRefreshFailureAt
      : undefined
  return {
    accessToken,
    refreshToken: asTrimmedString(record.refreshToken),
    idToken: asTrimmedString(record.idToken),
    expiresAt,
    scope: asTrimmedString(record.scope),
    profileId: asTrimmedString(record.profileId),
    lastRefreshAt,
    lastRefreshFailureAt,
  }
}

function shouldRefresh(blob: XaiOAuthCredentialBlob): boolean {
  const expiresAt = blob.expiresAt ?? parseXaiTokenExpiryMs(blob.accessToken)
  return expiresAt !== undefined && expiresAt <= Date.now() + REFRESH_SKEW_MS
}

function isCoolingDown(blob: XaiOAuthCredentialBlob, now = Date.now()): boolean {
  const lastRefreshFailureAt = Math.max(
    blob.lastRefreshFailureAt ?? 0,
    inMemoryLastRefreshFailureAt ?? 0,
  )
  return Boolean(
    lastRefreshFailureAt &&
      now - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS,
  )
}

export function readXaiOAuthCredentials(): XaiOAuthCredentialBlob | undefined {
  if (isBareMode()) return undefined
  try {
    const data = getXaiSecureStorage().read()
    return normalizeXaiOAuthCredentialBlob(data?.[XAI_OAUTH_STORAGE_KEY])
  } catch {
    return undefined
  }
}

export async function readXaiOAuthCredentialsAsync(): Promise<
  XaiOAuthCredentialBlob | undefined
> {
  if (isBareMode()) return undefined
  try {
    const data = await getXaiSecureStorage().readAsync()
    return normalizeXaiOAuthCredentialBlob(data?.[XAI_OAUTH_STORAGE_KEY])
  } catch {
    return undefined
  }
}

export function saveXaiOAuthCredentials(
  credentials: XaiOAuthCredentialBlob,
): { success: boolean; warning?: string } {
  if (isBareMode()) {
    return { success: false, warning: 'Bare mode: secure storage is disabled.' }
  }
  const normalized = normalizeXaiOAuthCredentialBlob(credentials)
  if (!normalized) {
    return { success: false, warning: 'xAI OAuth credentials are incomplete.' }
  }
  const secureStorage = getXaiSecureStorage()
  const previous = secureStorage.read() || {}
  const previousXai = normalizeXaiOAuthCredentialBlob(
    previous[XAI_OAUTH_STORAGE_KEY],
  )
  const next = {
    ...(previous as Record<string, unknown>),
    [XAI_OAUTH_STORAGE_KEY]: {
      ...normalized,
      profileId: normalized.profileId ?? previousXai?.profileId,
      lastRefreshAt: normalized.lastRefreshAt ?? Date.now(),
    },
  }
  const result = secureStorage.update(next as typeof previous)
  if (result.success) {
    const stored = normalizeXaiOAuthCredentialBlob(next[XAI_OAUTH_STORAGE_KEY])
    inMemoryLastRefreshFailureAt = stored?.lastRefreshFailureAt ?? null
  }
  return result
}

export function clearXaiOAuthCredentials(): {
  success: boolean
  warning?: string
} {
  if (isBareMode()) return { success: true }
  const secureStorage = getXaiSecureStorage()
  const previous = secureStorage.read() || {}
  const next = { ...(previous as Record<string, unknown>) }
  delete next[XAI_OAUTH_STORAGE_KEY]
  const result = secureStorage.update(next as typeof previous)
  if (result.success) {
    inMemoryLastRefreshFailureAt = null
  }
  return result
}

function persistRefreshFailure(
  credentials: XaiOAuthCredentialBlob,
  occurredAt: number,
): void {
  const result = saveXaiOAuthCredentials({
    ...credentials,
    lastRefreshFailureAt: occurredAt,
  })
  if (!result.success) {
    inMemoryLastRefreshFailureAt = occurredAt
  }
}

export async function refreshXaiOAuthAccessTokenIfNeeded(options?: {
  force?: boolean
}): Promise<{ refreshed: boolean; credentials?: XaiOAuthCredentialBlob }> {
  if (isBareMode()) return { refreshed: false }
  const current = await readXaiOAuthCredentialsAsync()
  if (!current) return { refreshed: false }
  if (!current.refreshToken) return { refreshed: false, credentials: current }
  if (!options?.force && !shouldRefresh(current)) {
    return { refreshed: false, credentials: current }
  }
  if (!options?.force && isCoolingDown(current)) {
    return { refreshed: false, credentials: current }
  }
  if (inFlightRefresh) return inFlightRefresh

  inFlightRefresh = (async () => {
    const attemptedAt = Date.now()
    try {
      const body = new URLSearchParams({
        client_id: XAI_OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken!,
      })
      const response = await fetch(XAI_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          text.trim()
            ? `xAI OAuth token refresh failed (${response.status}): ${text.trim()}`
            : `xAI OAuth token refresh failed with status ${response.status}.`,
        )
      }
      const payload = (await response.json()) as XaiTokenRefreshResponse
      const accessToken = asTrimmedString(payload.access_token)
      if (!accessToken) {
        throw new Error('xAI OAuth refresh succeeded without an access token.')
      }
      const next: XaiOAuthCredentialBlob = {
        accessToken,
        refreshToken:
          asTrimmedString(payload.refresh_token) ?? current.refreshToken,
        idToken: asTrimmedString(payload.id_token) ?? current.idToken,
        expiresAt: coerceXaiExpiresAtMs(payload.expires_in, accessToken),
        scope: asTrimmedString(payload.scope) ?? current.scope,
        profileId: current.profileId,
        lastRefreshAt: Date.now(),
      }
      const saved = saveXaiOAuthCredentials(next)
      if (!saved.success) {
        throw new Error(
          saved.warning ??
            'xAI OAuth refresh succeeded but credentials could not be saved.',
        )
      }
      return { refreshed: true, credentials: next }
    } catch (error) {
      persistRefreshFailure(current, attemptedAt)
      throw error
    } finally {
      inFlightRefresh = null
    }
  })()

  return inFlightRefresh
}

export async function resolveXaiOAuthAccessToken(options?: {
  forceRefresh?: boolean
}): Promise<string | undefined> {
  const refreshed = await refreshXaiOAuthAccessTokenIfNeeded({
    force: options?.forceRefresh,
  }).catch(() => undefined)
  const credentials =
    refreshed?.credentials ?? (await readXaiOAuthCredentialsAsync())
  return credentials?.accessToken
}
