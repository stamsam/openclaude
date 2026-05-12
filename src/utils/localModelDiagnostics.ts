import {
  DEFAULT_OMLX_BASE_URL,
  DEFAULT_OLLAMA_BASE_URL,
  getOmlxApiBaseUrl,
  getOmlxChatBaseUrl,
  getOllamaApiBaseUrl,
  getOllamaChatBaseUrl,
  listOpenAICompatibleModels,
} from './providerDiscovery.js'

export type LocalDiagnosticProvider =
  | 'ollama'
  | 'omlx'
  | 'omlx-anthropic'
  | 'openai-compatible'

export type LocalGenerationProbe = {
  ok: boolean
  provider: LocalDiagnosticProvider
  baseUrl: string
  model?: string
  latencyMs?: number
  outputTokens?: number
  tokensPerSecond?: number
  text?: string
  detail?: string
}

export type LocalModelDiagnosticsReport = {
  provider: LocalDiagnosticProvider
  baseUrl: string
  models: string[]
  selectedModel?: string
  reachable: boolean
  generation?: LocalGenerationProbe
}

type DiagnosticOptions = {
  provider: LocalDiagnosticProvider
  baseUrl?: string
  model?: string
  apiKey?: string
  timeoutMs?: number
  benchmark?: boolean
  prewarm?: boolean
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function withTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal
  clear: () => void
} {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

function compactDetail(value: string, maxLength = 220): string {
  const compact = value.trim().replace(/\s+/g, ' ')
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength)}...`
    : compact
}

function resolveApiKey(options: DiagnosticOptions): string | undefined {
  return (
    options.apiKey ??
    process.env.OMLX_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY
  )
}

function openAIHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

function anthropicHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  }
}

function getProviderBaseUrl(options: DiagnosticOptions): string {
  if (options.provider === 'ollama') {
    return getOllamaApiBaseUrl(options.baseUrl)
  }
  if (options.provider === 'omlx') {
    return getOmlxChatBaseUrl(options.baseUrl)
  }
  if (options.provider === 'omlx-anthropic') {
    return getOmlxApiBaseUrl(options.baseUrl)
  }
  return trimTrailingSlash(
    options.baseUrl ?? process.env.OPENAI_BASE_URL ?? getOmlxChatBaseUrl(),
  )
}

async function listOllamaNames(baseUrl: string, timeoutMs: number): Promise<{
  reachable: boolean
  models: string[]
}> {
  const { signal, clear } = withTimeoutSignal(timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal })
    if (!response.ok) {
      return { reachable: false, models: [] }
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string }>
    }
    return {
      reachable: true,
      models: (payload.models ?? [])
        .map(model => model.name)
        .filter((name): name is string => Boolean(name)),
    }
  } catch {
    return { reachable: false, models: [] }
  } finally {
    clear()
  }
}

async function probeOpenAICompatible(options: {
  provider: LocalDiagnosticProvider
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
}): Promise<LocalGenerationProbe> {
  const start = performance.now()
  const { signal, clear } = withTimeoutSignal(options.timeoutMs)
  try {
    const response = await fetch(`${trimTrailingSlash(options.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: openAIHeaders(options.apiKey),
      signal,
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: 0,
        max_tokens: 8,
        stream: false,
      }),
    })
    const latencyMs = performance.now() - start
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        provider: options.provider,
        baseUrl: options.baseUrl,
        model: options.model,
        latencyMs,
        detail: `status ${response.status}: ${compactDetail(raw)}`,
      }
    }
    const payload = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { completion_tokens?: number }
    }
    const outputTokens = payload.usage?.completion_tokens
    return {
      ok: true,
      provider: options.provider,
      baseUrl: options.baseUrl,
      model: options.model,
      latencyMs,
      outputTokens,
      tokensPerSecond: outputTokens
        ? outputTokens / Math.max(latencyMs / 1000, 0.001)
        : undefined,
      text: payload.choices?.[0]?.message?.content,
    }
  } catch (error) {
    return {
      ok: false,
      provider: options.provider,
      baseUrl: options.baseUrl,
      model: options.model,
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clear()
  }
}

async function probeAnthropicCompatible(options: {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
}): Promise<LocalGenerationProbe> {
  const start = performance.now()
  const { signal, clear } = withTimeoutSignal(options.timeoutMs)
  try {
    const response = await fetch(`${trimTrailingSlash(options.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(options.apiKey),
      signal,
      body: JSON.stringify({
        model: options.model,
        max_tokens: 8,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      }),
    })
    const latencyMs = performance.now() - start
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        provider: 'omlx-anthropic',
        baseUrl: options.baseUrl,
        model: options.model,
        latencyMs,
        detail: `status ${response.status}: ${compactDetail(raw)}`,
      }
    }
    const payload = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>
      usage?: { output_tokens?: number }
    }
    const outputTokens = payload.usage?.output_tokens
    return {
      ok: true,
      provider: 'omlx-anthropic',
      baseUrl: options.baseUrl,
      model: options.model,
      latencyMs,
      outputTokens,
      tokensPerSecond: outputTokens
        ? outputTokens / Math.max(latencyMs / 1000, 0.001)
        : undefined,
      text: payload.content?.find(part => part.type === 'text')?.text,
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'omlx-anthropic',
      baseUrl: options.baseUrl,
      model: options.model,
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clear()
  }
}

async function probeOllama(options: {
  baseUrl: string
  model: string
  timeoutMs: number
}): Promise<LocalGenerationProbe> {
  const start = performance.now()
  const { signal, clear } = withTimeoutSignal(options.timeoutMs)
  try {
    const response = await fetch(`${options.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: options.model,
        stream: false,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        options: { temperature: 0, num_predict: 8 },
      }),
    })
    const latencyMs = performance.now() - start
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        provider: 'ollama',
        baseUrl: options.baseUrl,
        model: options.model,
        latencyMs,
        detail: `status ${response.status}: ${compactDetail(raw)}`,
      }
    }
    const payload = JSON.parse(raw) as {
      message?: { content?: string }
      eval_count?: number
      eval_duration?: number
    }
    return {
      ok: true,
      provider: 'ollama',
      baseUrl: options.baseUrl,
      model: options.model,
      latencyMs,
      outputTokens: payload.eval_count,
      tokensPerSecond:
        payload.eval_count && payload.eval_duration
          ? payload.eval_count / (payload.eval_duration / 1_000_000_000)
          : undefined,
      text: payload.message?.content,
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'ollama',
      baseUrl: options.baseUrl,
      model: options.model,
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clear()
  }
}

export async function runLocalModelDiagnostics(
  options: DiagnosticOptions,
): Promise<LocalModelDiagnosticsReport> {
  const timeoutMs = options.timeoutMs ?? 8000
  const apiKey = resolveApiKey(options)
  const baseUrl = getProviderBaseUrl(options)
  const catalog =
    options.provider === 'ollama'
      ? await listOllamaNames(baseUrl, timeoutMs)
      : {
          reachable: Boolean(
            await listOpenAICompatibleModels({
              baseUrl:
                options.provider === 'omlx-anthropic'
                  ? getOmlxChatBaseUrl(options.baseUrl)
                  : baseUrl,
              apiKey,
            }),
          ),
          models:
            (await listOpenAICompatibleModels({
              baseUrl:
                options.provider === 'omlx-anthropic'
                  ? getOmlxChatBaseUrl(options.baseUrl)
                  : baseUrl,
              apiKey,
            })) ?? [],
        }

  const selectedModel = options.model ?? catalog.models[0]
  const report: LocalModelDiagnosticsReport = {
    provider: options.provider,
    baseUrl,
    models: catalog.models,
    selectedModel,
    reachable: catalog.reachable,
  }

  if (!selectedModel || (!options.benchmark && !options.prewarm)) {
    return report
  }

  if (options.provider === 'ollama') {
    report.generation = await probeOllama({
      baseUrl,
      model: selectedModel,
      timeoutMs,
    })
  } else if (options.provider === 'omlx-anthropic') {
    report.generation = await probeAnthropicCompatible({
      baseUrl,
      model: selectedModel,
      apiKey,
      timeoutMs,
    })
  } else {
    report.generation = await probeOpenAICompatible({
      provider: options.provider,
      baseUrl,
      model: selectedModel,
      apiKey,
      timeoutMs,
    })
  }

  return report
}

export function defaultLocalDiagnosticProvider(): LocalDiagnosticProvider {
  const baseUrl =
    process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE ?? ''
  if (baseUrl.includes('11434')) return 'ollama'
  if (baseUrl.includes('8000')) return 'omlx'
  if (process.env.ANTHROPIC_BASE_URL?.includes('8000')) return 'omlx-anthropic'
  if (process.env.OMLX_API_KEY || process.env.OPENAI_BASE_URL?.includes('omlx')) {
    return 'omlx'
  }
  if (!baseUrl && DEFAULT_OMLX_BASE_URL && DEFAULT_OLLAMA_BASE_URL) {
    return 'omlx'
  }
  return 'openai-compatible'
}
