import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'

type JsonObject = Record<string, unknown>

const OMLX_CONTEXT_WINDOW_ENV_KEYS = [
  'OPENCLAUDE_OMLX_CONTEXT_WINDOW',
  'OMLX_CONTEXT_WINDOW',
  'OMLX_CONTEXT_TOKENS',
  'OMLX_CONTEXT_LENGTH',
  'OMLX_MAX_CONTEXT_TOKENS',
] as const

const HIGH_CONFIDENCE_CONTEXT_KEYS = [
  'context_window',
  'contextWindow',
  'context_window_size',
  'contextWindowSize',
  'context_length',
  'contextLength',
  'context_size',
  'contextSize',
  'max_context_tokens',
  'maxContextTokens',
  'max_context_length',
  'maxContextLength',
  'max_position_embeddings',
  'model_max_length',
  'max_sequence_length',
  'max_seq_len',
  'seq_length',
  'n_positions',
] as const

const LOW_CONFIDENCE_CONTEXT_KEYS = ['sliding_window', 'slidingWindow'] as const

const MODEL_DIR_KEYS = [
  'model_dir',
  'modelDir',
  'models_dir',
  'modelsDir',
  'model_path',
  'modelPath',
  'models_path',
  'modelsPath',
  'model_dirs',
  'modelDirs',
  'model_paths',
  'modelPaths',
] as const

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

function readOmlxSettings(homeDir = homedir()): JsonObject | undefined {
  try {
    const raw = readFileSync(join(homeDir, '.omlx', 'settings.json'), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : undefined
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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const parsed = parseInt(value.replace(/_/g, ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function findContextWindowInObject(
  value: unknown,
  keys: readonly string[] = HIGH_CONFIDENCE_CONTEXT_KEYS,
  depth = 0,
): number | undefined {
  if (!isRecord(value) || depth > 3) {
    return undefined
  }

  for (const key of keys) {
    const parsed = parsePositiveInteger(value[key])
    if (parsed !== undefined) {
      return parsed
    }
  }

  for (const nestedKey of [
    'runtime',
    'model',
    'models',
    'active_model',
    'loaded_model',
    'generation',
    'server',
    'config',
    'model_config',
    'text_config',
    'llm_config',
    'rope_scaling',
  ]) {
    const parsed = findContextWindowInObject(value[nestedKey], keys, depth + 1)
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

function readJsonFile(path: string): JsonObject | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(Boolean)
}

function getOmlxModelDirs(settings: JsonObject | undefined, homeDir: string): string[] {
  const dirs = new Set<string>([join(homeDir, '.omlx', 'models')])
  for (const key of MODEL_DIR_KEYS) {
    for (const value of asStringArray(settings?.[key])) {
      dirs.add(value.replace(/^~(?=\/|$)/, homeDir))
    }
  }
  return [...dirs]
}

function getModelCandidates(model?: string): string[] {
  const trimmed = model?.trim()
  if (!trimmed) return []
  const withoutProviderSuffix = trimmed.replace(/:[^/:]+$/, '')
  const parts = new Set<string>([
    trimmed,
    withoutProviderSuffix,
    trimmed.replace(/\//g, '__'),
    withoutProviderSuffix.replace(/\//g, '__'),
    trimmed.replace(/\//g, '-'),
    withoutProviderSuffix.replace(/\//g, '-'),
    basename(trimmed),
    basename(withoutProviderSuffix),
  ])
  return [...parts].filter(Boolean)
}

function findContextWindowInSettingsForModel(
  settings: JsonObject | undefined,
  model?: string,
): number | undefined {
  const direct = findContextWindowInObject(settings)
  if (direct !== undefined) {
    return direct
  }

  const candidates = getModelCandidates(model).map(candidate =>
    candidate.toLowerCase(),
  )
  if (!settings || candidates.length === 0) {
    return undefined
  }

  for (const containerKey of ['models', 'model_settings', 'profiles']) {
    const container = settings[containerKey]
    if (!isRecord(container)) continue
    for (const [key, value] of Object.entries(container)) {
      if (candidates.includes(key.trim().toLowerCase())) {
        const parsed = findContextWindowInObject(value)
        if (parsed !== undefined) {
          return parsed
        }
      }
    }
  }

  return undefined
}

function readModelConfigContextWindow(
  settings: JsonObject | undefined,
  model: string | undefined,
  homeDir: string,
): number | undefined {
  const candidates = getModelCandidates(model)
  if (candidates.length === 0) {
    return undefined
  }

  for (const modelDir of getOmlxModelDirs(settings, homeDir)) {
    if (!existsSync(modelDir)) continue
    const entries = new Set<string>(candidates)
    try {
      for (const entry of readdirSync(modelDir, { withFileTypes: true })) {
        if (entry.isDirectory() && candidates.includes(entry.name)) {
          entries.add(entry.name)
        }
      }
    } catch {
      // ignore unreadable model directories
    }

    for (const candidate of entries) {
      const candidateDir = join(modelDir, candidate)
      for (const configName of ['config.json', 'model_config.json']) {
        const config = readJsonFile(join(candidateDir, configName))
        const highConfidence = findContextWindowInObject(config)
        if (highConfidence !== undefined) {
          return highConfidence
        }
        const lowConfidence = findContextWindowInObject(
          config,
          LOW_CONFIDENCE_CONTEXT_KEYS,
        )
        if (lowConfidence !== undefined) {
          return lowConfidence
        }
      }
    }
  }

  return undefined
}

export function readOmlxContextWindow(options?: {
  model?: string
  processEnv?: NodeJS.ProcessEnv
  homeDir?: string
}): number | undefined {
  const processEnv = options?.processEnv ?? process.env
  for (const key of OMLX_CONTEXT_WINDOW_ENV_KEYS) {
    const parsed = parsePositiveInteger(processEnv[key])
    if (parsed !== undefined) {
      return parsed
    }
  }

  const homeDir = options?.homeDir ?? homedir()
  const settings = readOmlxSettings(homeDir)
  return (
    findContextWindowInSettingsForModel(settings, options?.model) ??
    readModelConfigContextWindow(settings, options?.model, homeDir)
  )
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
