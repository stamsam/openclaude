import { getOmlxApiKey, isLikelyOmlxBaseUrl } from './omlxSettings.js'

type UnloadResult =
  | { attempted: false; reason: 'disabled' | 'not_omlx' | 'no_previous_model' | 'same_model' }
  | { attempted: true; ok: true; status: number }
  | { attempted: true; ok: false; status?: number; error: string }

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizeOpenAIBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value)
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

function getActiveOmlxBaseUrl(
  processEnv: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates = [
    processEnv.OPENAI_BASE_URL,
    processEnv.OPENAI_API_BASE,
    processEnv.ANTHROPIC_BASE_URL,
  ]
  return candidates.find(value => value && isLikelyOmlxBaseUrl(value))
}

export function shouldAutoUnloadPreviousLocalModel(
  enabled: boolean,
  previousModel: string | null | undefined,
  nextModel: string | null | undefined,
  processEnv: NodeJS.ProcessEnv = process.env,
): UnloadResult {
  if (!enabled) return { attempted: false, reason: 'disabled' }
  const previous = previousModel?.trim()
  if (!previous) return { attempted: false, reason: 'no_previous_model' }
  if (previous === nextModel?.trim()) return { attempted: false, reason: 'same_model' }
  if (!getActiveOmlxBaseUrl(processEnv)) return { attempted: false, reason: 'not_omlx' }
  return { attempted: true, ok: true, status: 0 }
}

export async function unloadPreviousOmlxModelAfterSwitch({
  enabled,
  previousModel,
  nextModel,
  timeoutMs = 2_500,
  processEnv = process.env,
}: {
  enabled: boolean
  previousModel: string | null | undefined
  nextModel: string | null | undefined
  timeoutMs?: number
  processEnv?: NodeJS.ProcessEnv
}): Promise<UnloadResult> {
  const preflight = shouldAutoUnloadPreviousLocalModel(
    enabled,
    previousModel,
    nextModel,
    processEnv,
  )
  if (!preflight.attempted) return preflight

  const baseUrl = getActiveOmlxBaseUrl(processEnv)
  const previous = previousModel!.trim()
  if (!baseUrl) return { attempted: false, reason: 'not_omlx' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const apiKey = getOmlxApiKey(undefined, processEnv)
    const response = await fetch(
      `${normalizeOpenAIBaseUrl(baseUrl)}/v1/models/${encodeURIComponent(previous)}/unload`,
      {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: controller.signal,
      },
    )
    if (response.ok || response.status === 400 || response.status === 404) {
      return { attempted: true, ok: true, status: response.status }
    }
    return {
      attempted: true,
      ok: false,
      status: response.status,
      error: `oMLX unload failed with HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : 'oMLX unload failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}
