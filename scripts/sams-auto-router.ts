// @ts-nocheck
import http from 'node:http'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const ROUTER_MODEL_ID = 'Sams auto router 4B-35B'
export const ROUTER_MODEL_ALIAS = 'sams-auto-router-4b-35b'
export const ROUTER_FAST_MODEL_ID = 'Sams auto router 4B-35B fast'
export const ROUTER_PREMIUM_MODEL_ID = 'Sams auto router 4B-35B premium'
export const ROUTER_REVIEW_MODEL_ID = 'Sams auto router 4B-35B review'

export const DEFAULT_SMALL_MODEL = 'Qwen3.5-4B-MLX-4bit-MTP'
export const DEFAULT_BIG_MODEL =
  'Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-MLX-4bit-MTP'

type RouterConfig = {
  host: string
  port: number
  omlxBaseUrl: string
  omlxApiKey: string
  smallModel: string
  bigModel: string
  preloadSmall: boolean
  unloadBigAfterUse: boolean
  requestTimeoutMs: number
  maxReviewDraftTokens: number
  routingMode: 'efficient' | 'balanced' | 'conservative'
  bigRouteThreshold: number
  reviewRouteThreshold: number
  stickyTurns: number
  stickyTtlMs: number
  qualityRetry: boolean
  logPath: string | null
}

type RouteDecision = {
  mode: 'small' | 'big' | 'review'
  label: 'SMALL_DIRECT' | 'BIG_DIRECT' | 'SMALL_THEN_VERIFY' | 'BIG_RETRY' | 'USER_OVERRIDE_BIG'
  backendModel: string
  reason: string
  score: number
  source?: 'rules' | 'sticky' | 'quality_gate' | 'override'
  qualityFlags?: string[]
}

type RouterState = {
  stickyUntil: number
  stickyRemaining: number
  lastBigReason: string | null
}

type RouteLogEvent = {
  id: string
  ts: string
  endpoint: string
  requested_model: string
  route_label: string
  route_mode: string
  route_reason: string
  route_score: number
  backend_model: string
  prompt_chars: number
  prompt_hash: string
  stream: boolean
  elapsed_ms: number
  ok: boolean
  status?: number
  usage?: any
  error?: string
  quality_flags?: string[]
  unloaded_big?: boolean
}

const HARD_KEYWORDS = [
  'architecture',
  'audit',
  'benchmark',
  'compare',
  'deep review',
  'final answer',
  'final judge',
  'fix ci',
  'hard',
  'important',
  'incident',
  'migration',
  'performance',
  'production',
  'rank',
  'regression',
  'release',
  'security',
  'ship',
  'stack rank',
  'subtle',
  'thorough',
]

const REVIEW_KEYWORDS = [
  'review',
  'check my work',
  'critique',
  'grade',
  'judge',
  'second pass',
  'verify',
]

const DEBUG_KEYWORDS = [
  'bug',
  'crash',
  'debug',
  'exception',
  'failing test',
  'fix this error',
  'stack trace',
  'traceback',
]

const EASY_KEYWORDS = [
  'app names',
  'brainstorm',
  'explain this command',
  'name ideas',
  'regex',
  'rewrite',
  'simple summary',
  'summarize these bullets',
  'tone',
]

const USER_OVERRIDE_BIG_KEYWORDS = [
  '35b',
  'be careful',
  'big model',
  'check carefully',
  'double check',
  'premium model',
  'think hard',
  'use big',
]

function readOmlxSettings(): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.omlx', 'settings.json'), 'utf8'))
  } catch {
    return null
  }
}

function getNestedString(value: any, path: string[]): string | null {
  let current = value
  for (const key of path) {
    current = current?.[key]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

function parseRoutingMode(value: string | null | undefined): RouterConfig['routingMode'] {
  if (value === 'efficient' || value === 'conservative') return value
  return 'balanced'
}

function readArg(name: string): string | null {
  const args = process.argv.slice(2)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? null : null
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}

export function loadRouterConfig(env = process.env): RouterConfig {
  const settings = readOmlxSettings()
  const settingsHost = getNestedString(settings, ['server', 'host']) ?? '127.0.0.1'
  const settingsPort = settings?.server?.port ?? 8000
  const omlxBaseUrl =
    readArg('--omlx-base-url') ??
    env.SAMS_ROUTER_OMLX_BASE_URL ??
    env.OMLX_BASE_URL ??
    `http://${settingsHost}:${settingsPort}`

  const routingMode = parseRoutingMode(readArg('--mode') ?? env.SAMS_ROUTER_MODE)
  const thresholds = {
    efficient: { big: 7, review: 5, stickyTurns: 0 },
    balanced: { big: 5, review: 3, stickyTurns: 1 },
    conservative: { big: 4, review: 2, stickyTurns: 2 },
  }[routingMode]

  return {
    host: readArg('--host') ?? env.SAMS_ROUTER_HOST ?? '127.0.0.1',
    port: Number(readArg('--port') ?? env.SAMS_ROUTER_PORT ?? 8001),
    omlxBaseUrl: omlxBaseUrl.replace(/\/+$/, ''),
    omlxApiKey:
      readArg('--omlx-api-key') ??
      env.SAMS_ROUTER_OMLX_API_KEY ??
      env.OMLX_API_KEY ??
      getNestedString(settings, ['auth', 'api_key']) ??
      '1234',
    smallModel: readArg('--small-model') ?? env.SAMS_ROUTER_SMALL_MODEL ?? DEFAULT_SMALL_MODEL,
    bigModel: readArg('--big-model') ?? env.SAMS_ROUTER_BIG_MODEL ?? DEFAULT_BIG_MODEL,
    preloadSmall: hasFlag('--no-preload-small')
      ? false
      : parseBool(env.SAMS_ROUTER_PRELOAD_SMALL, true),
    unloadBigAfterUse: hasFlag('--keep-big-loaded')
      ? false
      : parseBool(env.SAMS_ROUTER_UNLOAD_BIG_AFTER_USE, true),
    requestTimeoutMs: Number(env.SAMS_ROUTER_TIMEOUT_MS ?? 20 * 60 * 1000),
    maxReviewDraftTokens: Number(env.SAMS_ROUTER_MAX_REVIEW_DRAFT_TOKENS ?? 1200),
    routingMode,
    bigRouteThreshold: Number(env.SAMS_ROUTER_BIG_THRESHOLD ?? thresholds.big),
    reviewRouteThreshold: Number(env.SAMS_ROUTER_REVIEW_THRESHOLD ?? thresholds.review),
    stickyTurns: Number(env.SAMS_ROUTER_STICKY_TURNS ?? thresholds.stickyTurns),
    stickyTtlMs: Number(env.SAMS_ROUTER_STICKY_TTL_MS ?? 2 * 60 * 1000),
    qualityRetry: parseBool(env.SAMS_ROUTER_QUALITY_RETRY, true),
    logPath:
      (readArg('--no-log') || parseBool(env.SAMS_ROUTER_LOG_ENABLED, true) === false)
        ? null
        : readArg('--log-path') ??
          env.SAMS_ROUTER_LOG_PATH ??
          join(homedir(), '.omlx', 'router', 'sams-auto-router.jsonl'),
  }
}

function normalizeText(messages: any[] | undefined, fallback: any): string {
  if (Array.isArray(messages)) {
    return messages
      .map(message => {
        const content = message?.content
        if (typeof content === 'string') return content
        if (Array.isArray(content)) {
          return content
            .map(part => {
              if (typeof part === 'string') return part
              return part?.text ?? part?.content ?? ''
            })
            .join('\n')
        }
        return ''
      })
      .join('\n')
  }
  return typeof fallback === 'string' ? fallback : JSON.stringify(fallback ?? '')
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword))
}

function codeFenceCount(text: string): number {
  return (text.match(/```/g) ?? []).length
}

function looksLikeHardCodeOrLogs(text: string): boolean {
  return (
    codeFenceCount(text) >= 4 ||
    /(^|\n)\s*(error|warning|traceback|exception|failed|panic|segmentation fault)[:\s]/i.test(text) ||
    /(^|\n).{0,80}(diff --git|@@ |npm ERR!|bun test|pytest|tsc --noEmit)/i.test(text)
  )
}

export function isRouterModel(model: string | undefined): boolean {
  if (!model) return true
  const normalized = model.toLowerCase()
  return (
    normalized === ROUTER_MODEL_ID.toLowerCase() ||
    normalized === ROUTER_MODEL_ALIAS ||
    normalized === ROUTER_FAST_MODEL_ID.toLowerCase() ||
    normalized === ROUTER_PREMIUM_MODEL_ID.toLowerCase() ||
    normalized === ROUTER_REVIEW_MODEL_ID.toLowerCase()
  )
}

function hashPrompt(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function isEasyFollowup(text: string, rawText: string): boolean {
  return rawText.length < 500 && containsAny(text, [
    'thanks',
    'thank you',
    'ok',
    'cool',
    'rewrite',
    'shorter',
    'make it shorter',
    'summarize',
  ])
}

function shouldUseStickyBig(body: any, state: RouterState | undefined): boolean {
  if (!state || state.stickyRemaining <= 0 || Date.now() > state.stickyUntil) return false
  const rawText = normalizeText(body?.messages, body?.input)
  const text = rawText.toLowerCase()
  if (isEasyFollowup(text, rawText)) return false
  return (
    rawText.length > 800 ||
    containsAny(text, ['also', 'same', 'that', 'those', 'it', 'now', 'next', 'second', 'another', 'what about']) ||
    containsAny(text, DEBUG_KEYWORDS) ||
    containsAny(text, REVIEW_KEYWORDS)
  )
}

export function chooseRoute(
  body: any,
  config: Pick<RouterConfig, 'smallModel' | 'bigModel'> &
    Partial<Pick<RouterConfig, 'bigRouteThreshold' | 'reviewRouteThreshold'>>,
  state?: RouterState,
): RouteDecision {
  const requestedModel = String(body?.model ?? ROUTER_MODEL_ID)
  const requested = requestedModel.toLowerCase()
  const text = normalizeText(body?.messages, body?.input).toLowerCase()
  const rawText = normalizeText(body?.messages, body?.input)
  const bigThreshold = config.bigRouteThreshold ?? 5
  const reviewThreshold = config.reviewRouteThreshold ?? 3

  if (requested === ROUTER_FAST_MODEL_ID.toLowerCase() || requested.includes(':fast')) {
    return {
      mode: 'small',
      label: 'SMALL_DIRECT',
      backendModel: config.smallModel,
      reason: 'explicit fast/small router model',
      score: 0,
      source: 'override',
    }
  }

  if (shouldUseStickyBig(body, state)) {
    state!.stickyRemaining -= 1
    return {
      mode: 'big',
      label: 'BIG_DIRECT',
      backendModel: config.bigModel,
      reason: `conversation stickiness after prior big route: ${state!.lastBigReason ?? 'prior big route'}`,
      score: bigThreshold,
      source: 'sticky',
    }
  }

  if (requested === ROUTER_PREMIUM_MODEL_ID.toLowerCase() || requested.includes(':premium') || requested.includes(':big')) {
    return {
      mode: 'big',
      label: 'USER_OVERRIDE_BIG',
      backendModel: config.bigModel,
      reason: 'explicit premium/big router model',
      score: 99,
      source: 'override',
    }
  }

  if (requested === ROUTER_REVIEW_MODEL_ID.toLowerCase() || requested.includes(':review')) {
    return {
      mode: 'review',
      label: 'SMALL_THEN_VERIFY',
      backendModel: config.bigModel,
      reason: 'explicit review router model',
      score: 5,
      source: 'override',
    }
  }

  let score = 0
  if (containsAny(text, USER_OVERRIDE_BIG_KEYWORDS)) score += 5
  if (containsAny(text, HARD_KEYWORDS)) score += 4
  if (containsAny(text, REVIEW_KEYWORDS)) score += 4
  if (containsAny(text, DEBUG_KEYWORDS)) score += 4
  if (looksLikeHardCodeOrLogs(rawText)) score += 4
  if (rawText.length > 7000) score += 3
  else if (rawText.length > 2500) score += 2
  if (Array.isArray(body?.tools) && body.tools.length > 0 && rawText.length > 3000) score += 2
  if (body?.response_format || body?.structured_outputs || /valid json|json schema|schema exactly|return only json/i.test(rawText)) score += 3
  if (/architecture|tradeoff|root cause|multi-step|step by step|rank|compare/i.test(rawText)) score += 2
  if (containsAny(text, EASY_KEYWORDS) && rawText.length < 2500) score -= 2

  if (containsAny(text, USER_OVERRIDE_BIG_KEYWORDS)) {
    return {
      mode: 'big',
      label: 'USER_OVERRIDE_BIG',
      backendModel: config.bigModel,
      reason: 'user override asked for big/careful routing',
      score,
      source: 'override',
    }
  }

  if (containsAny(text, REVIEW_KEYWORDS) && score >= bigThreshold) {
    return {
      mode: 'review',
      label: 'SMALL_THEN_VERIFY',
      backendModel: config.bigModel,
      reason: 'review wording plus high routing score',
      score,
      source: 'rules',
    }
  }

  if (score >= bigThreshold) {
    return {
      mode: 'big',
      label: 'BIG_DIRECT',
      backendModel: config.bigModel,
      reason: 'routing score reached big-model threshold',
      score,
      source: 'rules',
    }
  }

  if (score >= reviewThreshold) {
    return {
      mode: 'review',
      label: 'SMALL_THEN_VERIFY',
      backendModel: config.bigModel,
      reason: 'borderline request gets small draft plus big verification',
      score,
      source: 'rules',
    }
  }

  return {
    mode: 'small',
    label: 'SMALL_DIRECT',
    backendModel: config.smallModel,
    reason: 'default fast path',
    score,
    source: 'rules',
  }
}

class OmlxClient {
  config: RouterConfig

  constructor(config: RouterConfig) {
    this.config = config
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.omlxApiKey}`,
      ...extra,
    }
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs)
    try {
      return await fetch(`${this.config.omlxBaseUrl}${path}`, {
        ...init,
        headers: {
          ...this.headers(),
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  async json(path: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetch(path, init)
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text}`)
    }
    return text.trim() ? JSON.parse(text) : {}
  }

  async loadModel(model: string): Promise<any> {
    return this.json(`/v1/models/${encodeURIComponent(model)}/load`, { method: 'POST' })
  }

  async unloadModel(model: string): Promise<any> {
    return this.json(`/v1/models/${encodeURIComponent(model)}/unload`, { method: 'POST' })
  }

  async safeUnloadModel(model: string): Promise<void> {
    try {
      await this.unloadModel(model)
    } catch {
      // A model may already be unloaded; that is fine for memory cleanup.
    }
  }

  async modelStatus(): Promise<any> {
    return this.json('/v1/models/status')
  }

  async health(): Promise<any> {
    return this.json('/health')
  }
}

async function readBody(request: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text.trim() ? JSON.parse(text) : {}
}

function sendJson(response: http.ServerResponse, status: number, value: any, headers: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  })
  response.end(JSON.stringify(value, null, 2))
}

function sendError(response: http.ServerResponse, status: number, message: string): void {
  sendJson(response, status, {
    error: {
      message,
      type: 'sam_router_error',
    },
  })
}

function routeHeaders(route: RouteDecision, requestId: string, backendModel: string, config: RouterConfig): Record<string, string> {
  return {
    'x-sam-router-request-id': requestId,
    'x-sam-router-route': route.mode,
    'x-sam-router-label': route.label,
    'x-sam-router-route-mode': config.routingMode,
    'x-sam-router-backend-model': backendModel,
    'x-sam-router-score': String(route.score),
    'x-sam-router-reason': route.reason,
  }
}

function virtualModels() {
  const created = Math.floor(Date.now() / 1000)
  return [ROUTER_MODEL_ID, ROUTER_MODEL_ALIAS, ROUTER_FAST_MODEL_ID, ROUTER_PREMIUM_MODEL_ID, ROUTER_REVIEW_MODEL_ID].map(id => ({
    id,
    object: 'model',
    created,
    owned_by: 'sam-local-router',
  }))
}

function makeReviewMessages(originalMessages: any[], draft: string): any[] {
  return [
    {
      role: 'system',
      content:
        'You are the premium reviewer in Sam’s local 4B-35B router. Review the small model draft against the user request. Return only the corrected final answer. Fix errors, remove visible scratchpad, and keep the answer concise.',
    },
    ...originalMessages,
    {
      role: 'user',
      content: `Small model draft to review and improve:\n\n${draft}`,
    },
  ]
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : part?.text ?? '').join('\n')
  }
  return ''
}

export function findQualityFlags(body: any, payload: any): string[] {
  const flags: string[] = []
  const text = extractAssistantText(payload)
  const lower = text.toLowerCase()
  const prompt = normalizeText(body?.messages, body?.input).toLowerCase()

  if (!text.trim()) flags.push('empty_output')
  if (/<think|<\/think|call:thought|reasoning_content|we need answer|let's craft|need answer/.test(lower)) {
    flags.push('visible_scratchpad')
  }

  const expectsJson = Boolean(
    body?.response_format?.type === 'json_object' ||
      body?.structured_outputs?.json ||
      /return only valid json|valid json|json schema|schema exactly/.test(prompt),
  )
  if (expectsJson) {
    try {
      JSON.parse(text)
    } catch {
      flags.push('invalid_json')
    }
  }

  if (/\b(no|not possible|impossible)\b[\s\S]{0,500}\b(yes|possible)\b/i.test(text) ||
      /\b(yes|possible)\b[\s\S]{0,500}\b(no|not possible|impossible)\b/i.test(text)) {
    flags.push('possible_contradiction')
  }

  if ((payload?.choices?.[0]?.finish_reason === 'length' || payload?.stop_reason === 'max_tokens') && text.length > 1500) {
    flags.push('hit_length_limit')
  }

  if (/(.{24,})\1\1/s.test(text)) {
    flags.push('repetition')
  }

  return flags
}

function appendRouteLog(config: RouterConfig, event: RouteLogEvent): void {
  if (!config.logPath) return
  try {
    mkdirSync(dirname(config.logPath), { recursive: true })
    appendFileSync(config.logPath, `${JSON.stringify(event)}\n`, 'utf8')
  } catch {
    // Logging must never break inference.
  }
}

function markBigRoute(state: RouterState, config: RouterConfig, route: RouteDecision): void {
  if (config.stickyTurns <= 0) return
  state.stickyRemaining = config.stickyTurns
  state.stickyUntil = Date.now() + config.stickyTtlMs
  state.lastBigReason = route.reason
}

function makeBigRetryRoute(previousRoute: RouteDecision, flags: string[], config: Pick<RouterConfig, 'bigModel'>): RouteDecision {
  return {
    mode: 'big',
    label: 'BIG_RETRY',
    backendModel: config.bigModel,
    reason: `4B quality gate failed: ${flags.join(', ')}`,
    score: Math.max(previousRoute.score, 5),
    source: 'quality_gate',
    qualityFlags: flags,
  }
}

async function callChatCompletion(omlx: OmlxClient, body: any, backendModel: string): Promise<Response> {
  return omlx.fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...body,
      model: backendModel,
    }),
  })
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return text.trim() ? JSON.parse(text) : {}
}

async function pipeResponse(upstream: Response, downstream: http.ServerResponse, headers: Record<string, string>): Promise<void> {
  downstream.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    ...headers,
  })
  if (!upstream.body) {
    downstream.end()
    return
  }
  const reader = upstream.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    downstream.write(Buffer.from(value))
  }
  downstream.end()
}

async function handleChatCompletion(
  body: any,
  response: http.ServerResponse,
  omlx: OmlxClient,
  config: RouterConfig,
  state: RouterState,
): Promise<void> {
  const started = Date.now()
  const requestId = crypto.randomUUID()
  const route = chooseRoute(body, config)
  const requestedModel = String(body?.model ?? ROUTER_MODEL_ID)
  const stream = body?.stream === true
  const promptText = normalizeText(body?.messages, body?.input)

  const log = (event: Partial<RouteLogEvent>) => appendRouteLog(config, {
    id: requestId,
    ts: new Date().toISOString(),
    endpoint: '/v1/chat/completions',
    requested_model: requestedModel,
    route_label: event.route_label ?? route.label,
    route_mode: event.route_mode ?? route.mode,
    route_reason: event.route_reason ?? route.reason,
    route_score: event.route_score ?? route.score,
    backend_model: event.backend_model ?? route.backendModel,
    prompt_chars: promptText.length,
    prompt_hash: hashPrompt(promptText),
    stream,
    elapsed_ms: Date.now() - started,
    ok: event.ok ?? true,
    ...event,
  })

  if (route.mode === 'small') {
    await omlx.loadModel(config.smallModel)
    const upstream = await callChatCompletion(omlx, body, config.smallModel)
    if (stream) {
        await pipeResponse(upstream, response, routeHeaders(route, requestId, config.smallModel, config))
      log({ status: upstream.status })
      return
    }
    const payload = await parseJsonResponse(upstream)
    const qualityFlags = config.qualityRetry ? findQualityFlags(body, payload) : []
    if (qualityFlags.length > 0) {
      const retryRoute = makeBigRetryRoute(route, qualityFlags, config)
      await omlx.loadModel(config.bigModel)
      try {
        const retryResponse = await callChatCompletion(omlx, body, config.bigModel)
        const retryPayload = await parseJsonResponse(retryResponse)
        retryPayload.model = requestedModel
        retryPayload.sam_router = {
          ...retryRoute,
          smallModel: config.smallModel,
          bigModel: config.bigModel,
          smallUsage: payload.usage ?? null,
        }
        sendJson(response, 200, retryPayload, routeHeaders(retryRoute, requestId, config.bigModel, config))
        log({
          route_label: retryRoute.label,
          route_mode: retryRoute.mode,
          route_reason: retryRoute.reason,
          route_score: retryRoute.score,
          backend_model: config.bigModel,
          usage: retryPayload.usage,
          quality_flags: qualityFlags,
          unloaded_big: config.unloadBigAfterUse,
        })
        markBigRoute(state, config, retryRoute)
      } finally {
        if (config.unloadBigAfterUse) await omlx.safeUnloadModel(config.bigModel)
      }
      return
    }
    payload.model = requestedModel
    payload.sam_router = route
    sendJson(response, 200, payload, routeHeaders(route, requestId, config.smallModel, config))
    log({ usage: payload.usage })
    return
  }

  if (route.mode === 'big' || stream) {
    await omlx.loadModel(config.bigModel)
    try {
      const upstream = await callChatCompletion(omlx, body, config.bigModel)
      if (stream) {
        await pipeResponse(upstream, response, routeHeaders(route, requestId, config.bigModel, config))
        log({ status: upstream.status, unloaded_big: config.unloadBigAfterUse })
        markBigRoute(state, config, route)
        return
      }
      const payload = await parseJsonResponse(upstream)
      payload.model = requestedModel
      payload.sam_router = route
      sendJson(response, 200, payload, routeHeaders(route, requestId, config.bigModel, config))
      log({ usage: payload.usage, unloaded_big: config.unloadBigAfterUse })
      markBigRoute(state, config, route)
    } finally {
      if (config.unloadBigAfterUse) await omlx.safeUnloadModel(config.bigModel)
    }
    return
  }

  await omlx.loadModel(config.smallModel)
  const draftResponse = await callChatCompletion(omlx, {
    ...body,
    stream: false,
    max_tokens: Math.min(Number(body.max_tokens ?? config.maxReviewDraftTokens), config.maxReviewDraftTokens),
  }, config.smallModel)
  const draftPayload = await parseJsonResponse(draftResponse)
  const draft = draftPayload?.choices?.[0]?.message?.content ?? ''

  await omlx.loadModel(config.bigModel)
  try {
    const reviewBody = {
      ...body,
      stream: false,
      messages: makeReviewMessages(body.messages ?? [], draft),
    }
    const finalResponse = await callChatCompletion(omlx, reviewBody, config.bigModel)
    const payload = await parseJsonResponse(finalResponse)
    payload.model = requestedModel
    payload.sam_router = {
      ...route,
      smallModel: config.smallModel,
      bigModel: config.bigModel,
      draftUsage: draftPayload.usage ?? null,
    }
    sendJson(response, 200, payload, routeHeaders(route, requestId, config.bigModel, config))
    log({ usage: payload.usage, unloaded_big: config.unloadBigAfterUse })
    markBigRoute(state, config, route)
  } finally {
    if (config.unloadBigAfterUse) await omlx.safeUnloadModel(config.bigModel)
  }
}

async function handleAnthropicMessages(
  body: any,
  response: http.ServerResponse,
  omlx: OmlxClient,
  config: RouterConfig,
  state: RouterState,
): Promise<void> {
  const started = Date.now()
  const requestId = crypto.randomUUID()
  const route = chooseRoute(body, config)
  const backendModel = route.mode === 'small' ? config.smallModel : config.bigModel
  const promptText = normalizeText(body?.messages, body?.input)
  await omlx.loadModel(backendModel)
  try {
    const upstream = await omlx.fetch('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        model: backendModel,
      }),
    })
    await pipeResponse(upstream, response, routeHeaders(route, requestId, backendModel, config))
    appendRouteLog(config, {
      id: requestId,
      ts: new Date().toISOString(),
      endpoint: '/v1/messages',
      requested_model: String(body?.model ?? ROUTER_MODEL_ID),
      route_label: route.label,
      route_mode: route.mode,
      route_reason: route.reason,
      route_score: route.score,
      backend_model: backendModel,
      prompt_chars: promptText.length,
      prompt_hash: hashPrompt(promptText),
      stream: body?.stream === true,
      elapsed_ms: Date.now() - started,
      ok: upstream.ok,
      status: upstream.status,
      unloaded_big: backendModel === config.bigModel && config.unloadBigAfterUse,
    })
    if (backendModel === config.bigModel) markBigRoute(state, config, route)
  } finally {
    if (backendModel === config.bigModel && config.unloadBigAfterUse) {
      await omlx.safeUnloadModel(config.bigModel)
    }
  }
}

export async function createRouterServer(config = loadRouterConfig()) {
  const omlx = new OmlxClient(config)
  const state: RouterState = {
    stickyUntil: 0,
    stickyRemaining: 0,
    lastBigReason: null,
  }

  async function handle(request: http.IncomingMessage, response: http.ServerResponse) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${config.host}:${config.port}`}`)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        const [health, status] = await Promise.allSettled([omlx.health(), omlx.modelStatus()])
        sendJson(response, 200, {
          status: 'healthy',
          name: ROUTER_MODEL_ID,
          small_model: config.smallModel,
          big_model: config.bigModel,
          omlx_base_url: config.omlxBaseUrl,
          routing_mode: config.routingMode,
          unload_big_after_use: config.unloadBigAfterUse,
          quality_retry: config.qualityRetry,
          log_path: config.logPath,
          sticky: {
            remaining: state.stickyRemaining,
            until: state.stickyUntil || null,
            last_big_reason: state.lastBigReason,
          },
          omlx_health: health.status === 'fulfilled' ? health.value : null,
          omlx_status: status.status === 'fulfilled' ? {
            loaded_count: status.value.loaded_count,
            current_model_memory: status.value.current_model_memory,
            max_model_memory: status.value.max_model_memory,
          } : null,
        })
        return
      }

      if (request.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(response, 200, {
          object: 'list',
          data: virtualModels(),
        })
        return
      }

      const loadMatch = url.pathname.match(/^\/v1\/models\/(.+)\/load$/)
      if (request.method === 'POST' && loadMatch) {
        const model = decodeURIComponent(loadMatch[1]!)
        const route = chooseRoute({ model, messages: [] }, config)
        const backend = route.mode === 'small' ? config.smallModel : config.bigModel
        const result = await omlx.loadModel(backend)
        sendJson(response, 200, { status: 'ok', model_id: model, backend_model: backend, result })
        return
      }

      const unloadMatch = url.pathname.match(/^\/v1\/models\/(.+)\/unload$/)
      if (request.method === 'POST' && unloadMatch) {
        const model = decodeURIComponent(unloadMatch[1]!)
        const route = chooseRoute({ model, messages: [] }, config)
        const backend = route.mode === 'small' ? config.smallModel : config.bigModel
        await omlx.safeUnloadModel(backend)
        sendJson(response, 200, { status: 'ok', model_id: model, backend_model: backend })
        return
      }

      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const body = await readBody(request)
        await handleChatCompletion(body, response, omlx, config, state)
        return
      }

      if (request.method === 'POST' && url.pathname === '/v1/messages') {
        const body = await readBody(request)
        await handleAnthropicMessages(body, response, omlx, config, state)
        return
      }

      sendError(response, 404, `Route not found: ${request.method} ${url.pathname}`)
    } catch (error) {
      sendError(response, 502, error instanceof Error ? error.message : String(error))
    }
  }

  return {
    config,
    server: http.createServer((request, response) => {
      void handle(request, response)
    }),
    omlx,
    state,
  }
}

async function main(): Promise<void> {
  const router = await createRouterServer()
  const { config, server, omlx } = router

  server.listen(config.port, config.host, async () => {
    console.log(`${ROUTER_MODEL_ID} listening on http://${config.host}:${config.port}/v1`)
    console.log(`Small model: ${config.smallModel}`)
    console.log(`Big model: ${config.bigModel}`)
    console.log(`oMLX: ${config.omlxBaseUrl}`)
    console.log(`OpenAI model: ${ROUTER_MODEL_ID}`)
    console.log(`Routing mode: ${config.routingMode}`)
    console.log(`35B unload after use: ${config.unloadBigAfterUse ? 'yes' : 'no'}`)
    if (config.logPath) console.log(`Route log: ${config.logPath}`)
    if (config.preloadSmall) {
      try {
        await omlx.loadModel(config.smallModel)
        console.log(`Preloaded small model: ${config.smallModel}`)
      } catch (error) {
        console.error(`Small model preload failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })

  const close = async () => {
    server.close()
    if (config.unloadBigAfterUse) {
      await omlx.safeUnloadModel(config.bigModel)
    }
    process.exit(0)
  }
  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
}

if (import.meta.main) {
  void main()
}
