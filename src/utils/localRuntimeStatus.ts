import { readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import { formatDuration, formatFileSize, formatTokens } from './format.js'
import { getOmlxApiKey, isLikelyOmlxBaseUrl } from './omlxSettings.js'

export type ProcessMemoryStatus = {
  rss: string
  heap: string
  external: string
  uptime: string
}

export type OmlxCacheStatus = {
  enabled?: boolean
  ssdCacheDir?: string
  ssdCacheUsed?: string
  ssdCacheMaxSize?: string
  hotCacheMaxSize?: string
  initialCacheBlocks?: number
}

export type OmlxMemoryStatus = {
  maxProcessMemory?: string
  maxModelMemory?: string
  prefillMemoryGuard?: boolean
  maxConcurrentRequests?: number
}

export type OmlxStatsStatus = {
  updatedAt?: string
  totalCachedTokens?: string
  topCachedModels: string[]
}

export type LocalRuntimeStatus = {
  process: ProcessMemoryStatus
  omlx?: {
    endpoint?: string
    active: boolean
    apiKeyConfigured: boolean
    cache?: OmlxCacheStatus
    memory?: OmlxMemoryStatus
    stats?: OmlxStatsStatus
  }
}

type OmlxSettingsPayload = {
  server?: {
    host?: unknown
    port?: unknown
  }
  model?: {
    max_model_memory?: unknown
  }
  memory?: {
    max_process_memory?: unknown
    prefill_memory_guard?: unknown
  }
  scheduler?: {
    max_concurrent_requests?: unknown
  }
  cache?: {
    enabled?: unknown
    ssd_cache_dir?: unknown
    ssd_cache_max_size?: unknown
    hot_cache_max_size?: unknown
    initial_cache_blocks?: unknown
  }
}

type OmlxStatsPayload = {
  total_cached_tokens?: unknown
  per_model?: unknown
}

function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function buildEndpoint(settings?: OmlxSettingsPayload): string | undefined {
  const host = stringValue(settings?.server?.host)
  const port = numberValue(settings?.server?.port)
  if (!host || !port) return undefined
  return `http://${host}:${port}/v1`
}

function directorySize(path: string): number | undefined {
  try {
    const info = statSync(path)
    if (!info.isDirectory()) return info.size
    let total = 0
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const childPath = join(path, entry.name)
      if (entry.isDirectory()) {
        total += directorySize(childPath) ?? 0
      } else if (entry.isFile()) {
        total += statSync(childPath).size
      }
    }
    return total
  } catch {
    return undefined
  }
}

export function buildProcessMemoryStatus(): ProcessMemoryStatus {
  const memory = process.memoryUsage()
  return {
    rss: formatFileSize(memory.rss),
    heap: `${formatFileSize(memory.heapUsed)} / ${formatFileSize(memory.heapTotal)}`,
    external: formatFileSize(memory.external),
    uptime: formatDuration(Math.round(process.uptime() * 1000), {
      hideTrailingZeros: true,
      mostSignificantOnly: true,
    }),
  }
}

export function summarizeOmlxStatsPayload(
  payload: OmlxStatsPayload | undefined,
  updatedAt?: string,
): OmlxStatsStatus | undefined {
  if (!payload) return undefined
  const totalCachedTokens = numberValue(payload.total_cached_tokens)
  const perModel = payload.per_model
  const topCachedModels =
    perModel && typeof perModel === 'object'
      ? Object.entries(perModel as Record<string, unknown>)
          .map(([model, rawStats]) => {
            const cachedTokens =
              rawStats && typeof rawStats === 'object'
                ? numberValue((rawStats as { cached_tokens?: unknown }).cached_tokens)
                : undefined
            return cachedTokens && cachedTokens > 0
              ? { model, cachedTokens }
              : undefined
          })
          .filter(
            (entry): entry is { model: string; cachedTokens: number } =>
              entry !== undefined,
          )
          .sort((a, b) => b.cachedTokens - a.cachedTokens)
          .slice(0, 3)
          .map(entry => `${entry.model} ${formatTokens(entry.cachedTokens)}`)
      : []

  if (!totalCachedTokens && topCachedModels.length === 0) return undefined

  return {
    updatedAt,
    totalCachedTokens:
      totalCachedTokens !== undefined ? formatTokens(totalCachedTokens) : undefined,
    topCachedModels,
  }
}

function readOmlxStats(statsPath: string): OmlxStatsStatus | undefined {
  const payload = readJsonFile<OmlxStatsPayload>(statsPath)
  let updatedAt: string | undefined
  try {
    updatedAt = statSync(statsPath).mtime.toLocaleString()
  } catch {
    updatedAt = undefined
  }
  return summarizeOmlxStatsPayload(payload, updatedAt)
}

export function getLocalRuntimeStatus(
  processEnv: NodeJS.ProcessEnv = process.env,
): LocalRuntimeStatus {
  const omlxDir = join(homedir(), '.omlx')
  const settings = readJsonFile<OmlxSettingsPayload>(join(omlxDir, 'settings.json'))
  const stats = readOmlxStats(join(omlxDir, 'stats.json'))
  const endpoint = buildEndpoint(settings)
  const activeBaseUrl = [
    processEnv.OPENAI_BASE_URL,
    processEnv.OPENAI_API_BASE,
    processEnv.ANTHROPIC_BASE_URL,
  ].find(value => value && isLikelyOmlxBaseUrl(value))

  const runtime: LocalRuntimeStatus = {
    process: buildProcessMemoryStatus(),
  }

  if (!settings && !stats && !activeBaseUrl) return runtime

  runtime.omlx = {
    endpoint: activeBaseUrl ?? endpoint,
    active: Boolean(activeBaseUrl),
    apiKeyConfigured: Boolean(getOmlxApiKey(undefined, processEnv)),
    cache: settings?.cache
      ? (() => {
          const ssdCacheDir = stringValue(settings.cache?.ssd_cache_dir)
          const ssdCacheBytes = ssdCacheDir
            ? directorySize(ssdCacheDir)
            : undefined
          return {
            enabled: booleanValue(settings.cache.enabled),
            ssdCacheDir,
            ssdCacheUsed:
              ssdCacheBytes !== undefined ? formatFileSize(ssdCacheBytes) : undefined,
            ssdCacheMaxSize: stringValue(settings.cache.ssd_cache_max_size),
            hotCacheMaxSize: stringValue(settings.cache.hot_cache_max_size),
            initialCacheBlocks: numberValue(settings.cache.initial_cache_blocks),
          }
        })()
      : undefined,
    memory:
      settings?.memory || settings?.model || settings?.scheduler
        ? {
            maxProcessMemory: stringValue(settings.memory?.max_process_memory),
            maxModelMemory: stringValue(settings.model?.max_model_memory),
            prefillMemoryGuard: booleanValue(settings.memory?.prefill_memory_guard),
            maxConcurrentRequests: numberValue(
              settings.scheduler?.max_concurrent_requests,
            ),
          }
        : undefined,
    stats,
  }

  return runtime
}
