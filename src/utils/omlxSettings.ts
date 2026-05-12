import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export function readOmlxSettingsApiKey(): string | undefined {
  try {
    const raw = readFileSync(join(homedir(), '.omlx', 'settings.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      auth?: {
        api_key?: unknown
      }
    }
    const value = parsed.auth?.api_key
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  } catch {
    return undefined
  }
}

export function getOmlxApiKey(
  apiKey?: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates = [
    apiKey,
    processEnv.OMLX_API_KEY,
    processEnv.OPENAI_API_KEY,
    readOmlxSettingsApiKey(),
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value) return value
  }
  return undefined
}

export function isLikelyOmlxBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl?.trim()) return false
  try {
    const parsed = new URL(baseUrl)
    const host = parsed.host.toLowerCase()
    const haystack = `${parsed.hostname.toLowerCase()} ${parsed.pathname.toLowerCase()}`
    return host.endsWith(':8000') || haystack.includes('omlx')
  } catch {
    return baseUrl.toLowerCase().includes('omlx')
  }
}
