import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import type { AddressInfo } from 'net'
import path from 'path'
import { renderMobileServerHtml } from './html.js'

export type MobileServerSnapshot = {
  state: 'idle' | 'busy' | 'starting' | 'stopped'
  workspace: string
  model?: string
  provider?: string
  busyOwner?: 'mobile' | 'terminal' | null
  canSubmit?: boolean
  canStop?: boolean
  activeRunId?: string | null
  lastResponse?: string | null
  messages?: MobileServerTimelineItem[]
  error?: string
}

export type MobileServerTimelineItem = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  active?: boolean
}

export type MobileServerSubmitResult =
  | { ok: true; runId?: string }
  | { ok: false; error: string; status?: number }

export type MobileServerHandle = {
  host: string
  port: number
  url: string
  stop: () => Promise<void>
}

export type StartMobileServerOptions = {
  host: string
  port: number
  token: string
  acceptedTokens?: string[]
  getSnapshot: () => MobileServerSnapshot
  submitPrompt: (prompt: string) => MobileServerSubmitResult
  stopCurrentRun: () => boolean
}

const MAX_JSON_BYTES = 64 * 1024
const MOBILE_SESSION_ID = 'live'
const SSE_SNAPSHOT_INTERVAL_MS = 800
const SSE_HEARTBEAT_INTERVAL_MS = 15_000
type AuthKind = 'bearer' | 'basic' | 'query' | 'cookie'

class JsonBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function startMobileServer({
  host,
  port,
  token,
  acceptedTokens,
  getSnapshot,
  submitPrompt,
  stopCurrentRun,
}: StartMobileServerOptions): Promise<MobileServerHandle> {
  const tokens = normalizeAcceptedTokens(token, acceptedTokens)
  const sseClients = new Set<() => void>()
  const server = createServer(async (req, res) => {
    try {
      await routeRequest(req, res, {
        token,
        acceptedTokens: tokens,
        getSnapshot,
        submitPrompt,
        stopCurrentRun,
        sseClients,
      })
    } catch (error) {
      if (error instanceof JsonBodyError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      sendJson(res, 500, {
        error: 'Mobile server error',
      })
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 100

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  const actualPort = address.port
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host

  return {
    host,
    port: actualPort,
    url: `http://${displayHost}:${actualPort}/?token=${encodeURIComponent(token)}`,
    stop: () => {
      for (const closeClient of [...sseClients]) {
        closeClient()
      }
      return new Promise(resolve => {
        server.close(() => resolve())
      })
    },
  }
}

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: {
    token: string
    acceptedTokens: Set<string>
    getSnapshot: () => MobileServerSnapshot
    submitPrompt: (prompt: string) => MobileServerSubmitResult
    stopCurrentRun: () => boolean
    sseClients: Set<() => void>
  },
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') {
    sendManifest(res)
    return
  }

  if (req.method === 'GET' && url.pathname === '/') {
    const tokenState = getTokenState(req, url, handlers.acceptedTokens)
    const nonce = createCspNonce()
    sendHtml(
      res,
      renderMobileServerHtml({
        tokenState,
        nonce,
        initialSnapshot:
          tokenState === 'provided' || tokenState === 'cookie'
            ? handlers.getSnapshot()
            : null,
      }),
      buildRootHeaders(url, handlers.acceptedTokens, nonce),
    )
    return
  }

  const authKind = getAuthorizationKind(req, url, handlers.acceptedTokens)
  if (!authKind) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (isUnsafeCrossSiteMutation(req)) {
    sendJson(res, 403, { error: 'Cross-site requests are not allowed' })
    return
  }
  if (isUnsafeCookieMutation(req, authKind)) {
    sendJson(res, 403, { error: 'Mobile CSRF header is required' })
    return
  }

  if (
    req.method === 'GET' &&
    (url.pathname === '/health' || url.pathname === '/global/health')
  ) {
    sendJson(res, 200, { healthy: true, mode: 'mobile-companion' })
    return
  }

  if (req.method === 'GET' && url.pathname === '/global/event') {
    openSnapshotEventStream(req, res, handlers.getSnapshot, handlers.sseClients)
    return
  }

  if (req.method === 'GET' && url.pathname === '/openapi.json') {
    sendJson(res, 200, buildOpenApiDocument(handlers.getSnapshot()))
    return
  }

  if (req.method === 'GET' && url.pathname === '/doc') {
    sendHtml(res, renderApiDocsHtml())
    return
  }

  if (
    req.method === 'GET' &&
    (url.pathname === '/project' || url.pathname === '/project/current')
  ) {
    const project = projectFromSnapshot(handlers.getSnapshot())
    sendJson(res, 200, url.pathname === '/project' ? [project] : project)
    return
  }

  if (
    req.method === 'GET' &&
    (url.pathname === '/provider' || url.pathname === '/config/providers')
  ) {
    const providers = providersFromSnapshot(handlers.getSnapshot())
    sendJson(
      res,
      200,
      url.pathname === '/config/providers'
        ? {
            providers: providers.all,
            default: providers.default,
          }
        : providers,
    )
    return
  }

  if (req.method === 'GET' && url.pathname === '/provider/auth') {
    sendJson(res, 200, {})
    return
  }

  if (req.method === 'GET' && url.pathname === '/command') {
    sendJson(res, 200, commandList())
    return
  }

  if (req.method === 'GET' && url.pathname === '/config') {
    const snapshot = handlers.getSnapshot()
    const provider = providerFromSnapshot(snapshot)
    sendJson(res, 200, {
      theme: 'openclaude-mobile',
      model: snapshot.model ?? 'current',
      provider: provider.id,
      path: {
        cwd: snapshot.workspace,
      },
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/session') {
    const snapshot = handlers.getSnapshot()
    sendJson(res, 200, [sessionFromSnapshot(snapshot)])
    return
  }

  if (req.method === 'GET' && url.pathname === '/session/status') {
    const snapshot = handlers.getSnapshot()
    sendJson(res, 200, {
      [MOBILE_SESSION_ID]: {
        state: snapshot.state,
        active: snapshot.state === 'busy' || !!snapshot.activeRunId,
        error: snapshot.error,
      },
    })
    return
  }

  if (
    req.method === 'GET' &&
    url.pathname === `/session/${MOBILE_SESSION_ID}/message`
  ) {
    sendJson(res, 200, messagesFromSnapshot(handlers.getSnapshot()))
    return
  }

  if (req.method === 'GET' && url.pathname === `/session/${MOBILE_SESSION_ID}`) {
    sendJson(res, 200, sessionFromSnapshot(handlers.getSnapshot()))
    return
  }

  if (
    req.method === 'POST' &&
    (url.pathname === `/session/${MOBILE_SESSION_ID}/message` ||
      url.pathname === `/session/${MOBILE_SESSION_ID}/prompt_async`)
  ) {
    const body = await readJsonBody(req)
    const prompt = promptFromMessageBody(body)
    if (!prompt) {
      sendJson(res, 400, { error: 'Missing prompt text' })
      return
    }
    const result = handlers.submitPrompt(prompt)
    if (!result.ok) {
      sendJson(res, result.status ?? 409, { error: result.error })
      return
    }
    if (url.pathname.endsWith('/prompt_async')) {
      sendNoContent(res)
      return
    }
    sendJson(res, 202, messageRecordFromText('user', prompt, result.runId))
    return
  }

  if (req.method === 'POST' && url.pathname === `/session/${MOBILE_SESSION_ID}/command`) {
    const body = await readJsonBody(req)
    const command = typeof body.command === 'string' ? body.command.trim() : ''
    if (!isAllowedMobileCommand(command)) {
      sendJson(res, 403, { error: 'Command is not available from mobile.' })
      return
    }
    const prompt = `/${command}`
    const result = handlers.submitPrompt(prompt)
    if (!result.ok) {
      sendJson(res, result.status ?? 409, { error: result.error })
      return
    }
    sendJson(res, 202, messageRecordFromText('user', prompt, result.runId))
    return
  }

  if (req.method === 'POST' && url.pathname === `/session/${MOBILE_SESSION_ID}/abort`) {
    if (!handlers.stopCurrentRun()) {
      sendJson(res, 409, { error: 'No mobile-owned run is active.' })
      return
    }
    sendJson(res, 200, true)
    return
  }

  if (
    req.method === 'GET' &&
    (url.pathname === '/api/status' || url.pathname === '/api/snapshot')
  ) {
    sendJson(res, 200, handlers.getSnapshot())
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/message') {
    const body = await readJsonBody(req)
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) {
      sendJson(res, 400, { error: 'Missing prompt' })
      return
    }
    const result = handlers.submitPrompt(prompt)
    if (!result.ok) {
      sendJson(res, result.status ?? 409, { error: result.error })
      return
    }
    sendJson(res, 202, result)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/stop') {
    if (!handlers.stopCurrentRun()) {
      sendJson(res, 409, { error: 'No mobile-owned run is active.' })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

function openSnapshotEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  getSnapshot: () => MobileServerSnapshot,
  sseClients: Set<() => void>,
): void {
  let sequence = 0
  let lastSnapshotJson = ''
  let lastHeartbeatAt = 0
  let closed = false

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')

  const emit = (type: string, properties: Record<string, unknown>) => {
    const snapshot = getSnapshot()
    const payload = {
      directory: snapshot.workspace,
      payload: {
        id: `mobile-${Date.now()}-${++sequence}`,
        type,
        properties,
      },
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  emit('server.connected', {
    sessionID: MOBILE_SESSION_ID,
    time: Date.now(),
  })

  const tick = () => {
    if (closed) return
    const snapshot = getSnapshot()
    const snapshotJson = JSON.stringify(snapshot)
    const now = Date.now()
    if (snapshotJson !== lastSnapshotJson) {
      lastSnapshotJson = snapshotJson
      emit('snapshot.updated', {
        sessionID: MOBILE_SESSION_ID,
        snapshot,
      })
      return
    }
    if (now - lastHeartbeatAt >= SSE_HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatAt = now
      emit('server.heartbeat', {
        sessionID: MOBILE_SESSION_ID,
        time: now,
      })
    }
  }

  tick()
  const interval = setInterval(tick, SSE_SNAPSHOT_INTERVAL_MS)
  const cleanup = () => {
    if (closed) return
    closed = true
    clearInterval(interval)
    sseClients.delete(cleanup)
    res.end()
  }
  sseClients.add(cleanup)
  req.on('close', cleanup)
}

function projectFromSnapshot(snapshot: MobileServerSnapshot): Record<string, unknown> {
  return {
    id: 'current',
    directory: snapshot.workspace,
    name: path.basename(snapshot.workspace) || snapshot.workspace,
  }
}

function sessionFromSnapshot(snapshot: MobileServerSnapshot): Record<string, unknown> {
  return {
    id: MOBILE_SESSION_ID,
    title: 'Live terminal session',
    directory: snapshot.workspace,
    time: {
      updated: Date.now(),
    },
  }
}

function providersFromSnapshot(snapshot: MobileServerSnapshot): Record<string, unknown> {
  const provider = providerFromSnapshot(snapshot)
  return {
    all: [provider],
    default: {
      providerID: provider.id,
      modelID: provider.models[0]?.id ?? 'current',
    },
    connected: [provider.id],
  }
}

function providerFromSnapshot(
  snapshot: MobileServerSnapshot,
): { id: string; name: string; models: Array<{ id: string; name: string }> } {
  const providerName = snapshot.provider?.trim() || 'OpenClaude'
  const modelName = snapshot.model?.trim() || 'current'
  return {
    id: slugifyProviderId(providerName),
    name: providerName,
    models: [
      {
        id: modelName,
        name: modelName,
      },
    ],
  }
}

function commandList(): Array<Record<string, unknown>> {
  return [
    {
      name: 'dismiss',
      description: 'Dismiss the active local overlay.',
      template: '/dismiss',
    },
  ]
}

function isAllowedMobileCommand(command: string): boolean {
  return command === 'dismiss'
}

function messagesFromSnapshot(
  snapshot: MobileServerSnapshot,
): Array<Record<string, unknown>> {
  return (snapshot.messages ?? []).map(message =>
    messageRecordFromText(message.role, message.text, message.id),
  )
}

function messageRecordFromText(
  role: MobileServerTimelineItem['role'],
  text: string,
  id = `mobile-${Date.now()}`,
): Record<string, unknown> {
  return {
    info: {
      id,
      sessionID: MOBILE_SESSION_ID,
      role,
      time: {
        created: Date.now(),
      },
    },
    parts: [
      {
        id: `${id}-text`,
        type: 'text',
        text,
      },
    ],
  }
}

function promptFromMessageBody(body: Record<string, unknown>): string {
  if (typeof body.prompt === 'string') return body.prompt.trim()
  if (typeof body.message === 'string') return body.message.trim()
  if (!Array.isArray(body.parts)) return ''
  return body.parts
    .map(part => {
      if (!part || typeof part !== 'object') return ''
      const typed = part as { type?: unknown; text?: unknown }
      return typed.type === 'text' && typeof typed.text === 'string'
        ? typed.text
        : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function buildOpenApiDocument(snapshot: MobileServerSnapshot): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'OpenClaude Mobile Companion API',
      version: '0.1.0',
      description:
        'Session-scoped mobile companion API for the live OpenClaude REPL.',
    },
    servers: [
      {
        url: '/',
        description: 'Current mobile companion server',
      },
    ],
    security: [{ bearerAuth: [] }, { basicAuth: [] }],
    paths: {
      '/global/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'Server is reachable' } },
        },
      },
      '/global/event': {
        get: {
          summary: 'Live event stream',
          responses: { '200': { description: 'Server-Sent Events stream' } },
        },
      },
      '/project/current': {
        get: {
          summary: 'Current project',
          responses: { '200': { description: 'Project metadata' } },
        },
      },
      '/project': {
        get: {
          summary: 'Project list',
          responses: { '200': { description: 'Project list with current project' } },
        },
      },
      '/config': {
        get: {
          summary: 'Mobile config',
          responses: { '200': { description: 'Current mobile config' } },
        },
      },
      '/config/providers': {
        get: {
          summary: 'Provider list and defaults',
          responses: { '200': { description: 'Provider list and default model' } },
        },
      },
      '/provider': {
        get: {
          summary: 'Providers',
          responses: { '200': { description: 'OpenCode-style provider list' } },
        },
      },
      '/provider/auth': {
        get: {
          summary: 'Provider auth methods',
          responses: { '200': { description: 'Provider auth methods by provider' } },
        },
      },
      '/command': {
        get: {
          summary: 'Commands',
          responses: { '200': { description: 'Mobile-safe command list' } },
        },
      },
      '/session': {
        get: {
          summary: 'Live sessions',
          responses: { '200': { description: 'Session list' } },
        },
      },
      '/session/status': {
        get: {
          summary: 'Session status map',
          responses: { '200': { description: 'Status by session ID' } },
        },
      },
      '/session/live': {
        get: {
          summary: 'Live session details',
          responses: { '200': { description: 'Live session metadata' } },
        },
      },
      '/session/live/message': {
        get: {
          summary: 'Live session messages',
          responses: { '200': { description: 'OpenCode-style message records' } },
        },
        post: {
          summary: 'Submit a prompt with an OpenCode-style message body',
          responses: { '202': { description: 'Prompt accepted' } },
        },
      },
      '/session/live/prompt_async': {
        post: {
          summary: 'Submit a prompt asynchronously',
          responses: { '204': { description: 'Prompt accepted' } },
        },
      },
      '/session/live/command': {
        post: {
          summary: 'Run a mobile-safe command',
          responses: { '202': { description: 'Command accepted' } },
        },
      },
      '/session/live/abort': {
        post: {
          summary: 'Stop the active mobile-owned run',
          responses: { '200': { description: 'Stop requested' } },
        },
      },
      '/api/snapshot': {
        get: {
          summary: 'Mobile UI snapshot',
          responses: { '200': { description: 'Current UI snapshot' } },
        },
      },
      '/api/message': {
        post: {
          summary: 'Submit a prompt',
          responses: { '202': { description: 'Prompt accepted' } },
        },
      },
      '/api/stop': {
        post: {
          summary: 'Stop the active mobile-owned run',
          responses: { '200': { description: 'Stop requested' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Use any username and the device token as the password.',
        },
      },
    },
    'x-openclaude': {
      mode: 'mobile-companion',
      sessionID: MOBILE_SESSION_ID,
      project: path.basename(snapshot.workspace) || 'current',
    },
  }
}

function renderApiDocsHtml(): string {
  const routes = [
    ['GET', '/global/health', 'Reachability check'],
    ['GET', '/global/event', 'SSE snapshot stream'],
    ['GET', '/project/current', 'Current project metadata'],
    ['GET', '/provider', 'Provider and model list'],
    ['GET', '/provider/auth', 'Provider auth methods'],
    ['GET', '/config', 'Mobile config summary'],
    ['GET', '/config/providers', 'Provider defaults'],
    ['GET', '/command', 'Mobile-safe command list'],
    ['GET', '/session', 'Live terminal session list'],
    ['GET', '/session/status', 'Live status map'],
    ['GET', '/session/live', 'Live terminal session details'],
    ['GET', '/session/live/message', 'OpenCode-style message records'],
    ['POST', '/session/live/message', 'Submit OpenCode-style message parts'],
    ['POST', '/session/live/prompt_async', 'Submit OpenCode-style async prompt'],
    ['POST', '/session/live/command', 'Run a mobile-safe command'],
    ['POST', '/session/live/abort', 'Stop active mobile-owned run'],
    ['GET', '/api/snapshot', 'Mobile UI snapshot'],
    ['POST', '/api/message', 'Submit prompt text'],
    ['POST', '/api/stop', 'Stop active mobile-owned run'],
  ]
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClaude Mobile API</title>
  <style>
    html { color-scheme: dark; background: #050506; color: #f1edf7; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
    body { margin: 0; padding: 18px; }
    h1 { font-size: 16px; margin: 0 0 6px; }
    p { color: #9a93a4; margin: 0 0 16px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; }
    td { border-top: 1px solid rgba(255,255,255,.12); padding: 8px 4px; vertical-align: top; }
    code { color: #b59cff; }
    .method { color: #7ee787; width: 48px; }
  </style>
</head>
<body>
  <h1>OpenClaude Mobile API</h1>
  <p>Use Bearer token auth, cookie pairing, or Basic auth with the device token as password. OpenAPI JSON is at <code>/openapi.json</code>.</p>
  <table>
    <tbody>
      ${routes
        .map(
          ([method, route, desc]) =>
            `<tr><td class="method">${method}</td><td><code>${route}</code></td><td>${desc}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`
}

function getAuthorizationKind(
  req: IncomingMessage,
  url: URL,
  acceptedTokens: Set<string>,
): AuthKind | null {
  const queryToken = url.searchParams.get('token')
  if (queryToken && isSafeMethod(req) && acceptedTokens.has(queryToken)) {
    return 'query'
  }

  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    return acceptedTokens.has(auth.slice('Bearer '.length)) ? 'bearer' : null
  }
  if (auth?.startsWith('Basic ')) {
    const decoded = decodeBasicAuth(auth.slice('Basic '.length))
    if (decoded && acceptedTokens.has(decoded.password)) return 'basic'
  }

  const cookieToken = parseCookie(req.headers.cookie).sam_mobile_token
  return cookieToken && acceptedTokens.has(cookieToken) ? 'cookie' : null
}

function decodeBasicAuth(value: string): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator < 0) return null
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return null
  }
}

function getTokenState(
  req: IncomingMessage,
  url: URL,
  acceptedTokens: Set<string>,
): 'missing' | 'provided' | 'cookie' | 'invalid' {
  const queryToken = url.searchParams.get('token')
  if (queryToken) {
    return acceptedTokens.has(queryToken) ? 'provided' : 'invalid'
  }
  const cookieToken = parseCookie(req.headers.cookie).sam_mobile_token
  if (cookieToken) {
    return acceptedTokens.has(cookieToken) ? 'cookie' : 'invalid'
  }
  return 'missing'
}

function normalizeAcceptedTokens(
  token: string,
  acceptedTokens?: string[],
): Set<string> {
  return new Set([token, ...(acceptedTokens ?? [])].filter(Boolean))
}

function buildRootHeaders(
  url: URL,
  acceptedTokens: Set<string>,
  nonce: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-security-policy': [
      "default-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "worker-src 'none'",
      "img-src 'self' data:",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      "connect-src 'self'",
    ].join('; '),
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
  const queryToken = url.searchParams.get('token')
  if (queryToken && acceptedTokens.has(queryToken)) {
    headers['set-cookie'] =
      `sam_mobile_token=${encodeURIComponent(queryToken)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`
  }
  if (queryToken && !acceptedTokens.has(queryToken)) {
    headers['set-cookie'] =
      'sam_mobile_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly'
  }
  return headers
}

function createCspNonce(): string {
  return randomBytes(18).toString('base64url')
}

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const parsed: Record<string, string> = {}
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey) continue
    try {
      parsed[rawKey] = decodeURIComponent(rawValue.join('=') || '')
    } catch {
      // Ignore malformed cookie values and let normal auth handling reject.
    }
  }
  return parsed
}

function isUnsafeCrossSiteMutation(req: IncomingMessage): boolean {
  if (isSafeMethod(req)) return false
  const secFetchSite = req.headers['sec-fetch-site']
  if (typeof secFetchSite === 'string' && secFetchSite === 'cross-site') {
    return true
  }
  const origin = req.headers.origin
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    const host = req.headers.host
    return !!host && parsed.host !== host
  } catch {
    return true
  }
}

function isUnsafeCookieMutation(req: IncomingMessage, authKind: AuthKind): boolean {
  if (isSafeMethod(req) || authKind !== 'cookie') return false
  return req.headers['x-openclaude-mobile'] !== '1'
}

function isSafeMethod(req: IncomingMessage): boolean {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
}

function slugifyProviderId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'openclaude'
  )
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new JsonBodyError('Request body too large', 413)
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_JSON_BYTES) {
      throw new JsonBodyError('Request body too large', 413)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    throw new JsonBodyError('Invalid JSON body', 400)
  }
}

function sendHtml(
  res: ServerResponse,
  html: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(html)
}

function sendManifest(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'application/manifest+json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(
    JSON.stringify({
      name: 'OpenClaude Mobile',
      short_name: 'OpenClaude',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#050506',
      theme_color: '#050506',
    }),
  )
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204, {
    'cache-control': 'no-store',
  })
  res.end()
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}
