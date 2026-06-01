import http from 'node:http'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_BIG_MODEL,
  DEFAULT_SMALL_MODEL,
  ROUTER_FAST_MODEL_ID,
  ROUTER_PREMIUM_MODEL_ID,
  ROUTER_REVIEW_MODEL_ID,
  chooseRoute,
  createRouterServer,
  findQualityFlags,
  isRouterModel,
} from './sams-auto-router.ts'

const config = {
  smallModel: DEFAULT_SMALL_MODEL,
  bigModel: DEFAULT_BIG_MODEL,
  bigRouteThreshold: 5,
  reviewRouteThreshold: 3,
}

const openServers: http.Server[] = []

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

function route(prompt: string, extra: Record<string, unknown> = {}) {
  return chooseRoute({
    model: 'Sams auto router 4B-35B',
    messages: [{ role: 'user', content: prompt }],
    ...extra,
  }, config)
}

describe('Sams auto router policy', () => {
  test('recognizes virtual router models', () => {
    expect(isRouterModel('Sams auto router 4B-35B')).toBe(true)
    expect(isRouterModel('sams-auto-router-4b-35b')).toBe(true)
    expect(isRouterModel(ROUTER_FAST_MODEL_ID)).toBe(true)
    expect(isRouterModel(ROUTER_PREMIUM_MODEL_ID)).toBe(true)
    expect(isRouterModel('Qwen3.5-4B-MLX-4bit-MTP')).toBe(false)
  })

  test('keeps simple low-risk prompts on the 4B model', () => {
    const decision = route('Rewrite this paragraph to sound cleaner.')
    expect(decision.label).toBe('SMALL_DIRECT')
    expect(decision.backendModel).toBe(DEFAULT_SMALL_MODEL)
  })

  test('routes explicit premium requests to the 35B model', () => {
    const decision = route('Use the big model and double check this answer.')
    expect(decision.label).toBe('USER_OVERRIDE_BIG')
    expect(decision.backendModel).toBe(DEFAULT_BIG_MODEL)
  })

  test('routes stack traces and failing tests to the 35B model', () => {
    const decision = route('Here is a traceback and a failing test. Debug the root cause.')
    expect(decision.label).toBe('BIG_DIRECT')
    expect(decision.backendModel).toBe(DEFAULT_BIG_MODEL)
  })

  test('uses small-then-verify for explicit review model', () => {
    const decision = chooseRoute({
      model: ROUTER_REVIEW_MODEL_ID,
      messages: [{ role: 'user', content: 'Draft a README from these notes.' }],
    }, config)
    expect(decision.label).toBe('SMALL_THEN_VERIFY')
  })

  test('uses fast model override for forced low-memory mode', () => {
    const decision = chooseRoute({
      model: ROUTER_FAST_MODEL_ID,
      messages: [{ role: 'user', content: 'Review this production diff carefully.' }],
    }, config)
    expect(decision.label).toBe('SMALL_DIRECT')
    expect(decision.backendModel).toBe(DEFAULT_SMALL_MODEL)
  })

  test('routes JSON/schema precision through verification', () => {
    const decision = route('Return only valid JSON matching this schema exactly.')
    expect(['SMALL_THEN_VERIFY', 'BIG_DIRECT']).toContain(decision.label)
    expect(decision.backendModel).toBe(DEFAULT_BIG_MODEL)
  })

  test('mode thresholds can make routing more efficient', () => {
    const decision = chooseRoute({
      model: 'Sams auto router 4B-35B',
      messages: [{ role: 'user', content: 'Return only valid JSON matching this schema exactly.' }],
    }, {
      ...config,
      bigRouteThreshold: 7,
      reviewRouteThreshold: 5,
    })
    expect(decision.label).toBe('SMALL_DIRECT')
  })

  test('conversation stickiness keeps a follow-up on the big model', () => {
    const state = {
      stickyUntil: Date.now() + 10_000,
      stickyRemaining: 1,
      lastBigReason: 'debugging regression',
    }
    const decision = chooseRoute({
      model: 'Sams auto router 4B-35B',
      messages: [{ role: 'user', content: 'Now implement the fix.' }],
    }, config, state)
    expect(decision.label).toBe('BIG_DIRECT')
    expect(decision.source).toBe('sticky')
    expect(state.stickyRemaining).toBe(0)
  })

  test('fast model override wins over conversation stickiness', () => {
    const state = {
      stickyUntil: Date.now() + 10_000,
      stickyRemaining: 1,
      lastBigReason: 'debugging regression',
    }
    const decision = chooseRoute({
      model: ROUTER_FAST_MODEL_ID,
      messages: [{ role: 'user', content: 'Now implement the fix.' }],
    }, config, state)
    expect(decision.label).toBe('SMALL_DIRECT')
    expect(decision.backendModel).toBe(DEFAULT_SMALL_MODEL)
  })

  test('quality gates catch scratchpad and invalid JSON', () => {
    expect(findQualityFlags({
      messages: [{ role: 'user', content: 'Return only valid JSON.' }],
      response_format: { type: 'json_object' },
    }, {
      choices: [{ message: { content: '<think>draft</think> nope' } }],
    })).toEqual(expect.arrayContaining(['visible_scratchpad', 'invalid_json']))
  })
})

function listen(server: http.Server): Promise<string> {
  openServers.push(server)
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'object' && address) {
        resolve(`http://127.0.0.1:${address.port}`)
      }
    })
  })
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(response.ok).toBe(true)
  return response.json()
}

async function waitForCall(calls: Array<{ path: string }>, path: string): Promise<void> {
  const deadline = Date.now() + 500
  while (Date.now() < deadline) {
    if (calls.some(call => call.path === path)) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function createFakeOmlx(options: { smallContent?: string; bigContent?: string } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = []
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    const body = raw ? JSON.parse(raw) : null
    calls.push({ method: request.method ?? 'GET', path: request.url ?? '/', body })

    if (request.url === '/health') {
      response.end(JSON.stringify({ status: 'healthy' }))
      return
    }
    if (request.url === '/v1/models/status') {
      response.end(JSON.stringify({ loaded_count: 0, current_model_memory: 0, max_model_memory: 1 }))
      return
    }
    if (request.url?.includes('/load') || request.url?.includes('/unload')) {
      response.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (request.url === '/v1/chat/completions') {
      const content = body?.model === DEFAULT_BIG_MODEL
        ? options.bigContent ?? 'BIG_OK'
        : options.smallContent ?? 'SMALL_OK'
      response.end(JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, calls }
}

function testRouterConfig(baseUrl: string) {
  return {
    host: '127.0.0.1',
    port: 0,
    omlxBaseUrl: baseUrl,
    omlxApiKey: 'test',
    smallModel: DEFAULT_SMALL_MODEL,
    bigModel: DEFAULT_BIG_MODEL,
    preloadSmall: false,
    unloadBigAfterUse: true,
    requestTimeoutMs: 5000,
    maxReviewDraftTokens: 1200,
    routingMode: 'balanced' as const,
    bigRouteThreshold: 5,
    reviewRouteThreshold: 3,
    stickyTurns: 1,
    stickyTtlMs: 120_000,
    qualityRetry: true,
    logPath: null,
  }
}

describe('Sams auto router server behavior', () => {
  test('unloads the big model after a direct big call', async () => {
    const fake = createFakeOmlx()
    const omlxUrl = await listen(fake.server)
    const router = await createRouterServer(testRouterConfig(omlxUrl))
    const routerUrl = await listen(router.server)

    const payload = await postJson(`${routerUrl}/v1/chat/completions`, {
      model: 'Sams auto router 4B-35B',
      messages: [{ role: 'user', content: 'Use the big model and debug this production traceback.' }],
      max_tokens: 8,
    })

    expect(payload.sam_router.label).toBe('USER_OVERRIDE_BIG')
    await waitForCall(fake.calls, `/v1/models/${encodeURIComponent(DEFAULT_BIG_MODEL)}/unload`)
    const paths = fake.calls.map(call => call.path)
    expect(paths).toContain(`/v1/models/${encodeURIComponent(DEFAULT_BIG_MODEL)}/load`)
    expect(paths).toContain('/v1/chat/completions')
    expect(paths).toContain(`/v1/models/${encodeURIComponent(DEFAULT_BIG_MODEL)}/unload`)
  })

  test('retries with big and unloads it when small output fails quality gates', async () => {
    const fake = createFakeOmlx({ smallContent: '<think>bad</think> nope', bigContent: 'BIG_FIXED' })
    const omlxUrl = await listen(fake.server)
    const router = await createRouterServer(testRouterConfig(omlxUrl))
    const routerUrl = await listen(router.server)

    const payload = await postJson(`${routerUrl}/v1/chat/completions`, {
      model: 'Sams auto router 4B-35B',
      messages: [{ role: 'user', content: 'Say hello.' }],
      max_tokens: 8,
    })

    expect(payload.choices[0].message.content).toBe('BIG_FIXED')
    expect(payload.sam_router.label).toBe('BIG_RETRY')
    expect(payload.sam_router.qualityFlags).toContain('visible_scratchpad')
    await waitForCall(fake.calls, `/v1/models/${encodeURIComponent(DEFAULT_BIG_MODEL)}/unload`)
    expect(fake.calls.map(call => call.path)).toContain(`/v1/models/${encodeURIComponent(DEFAULT_BIG_MODEL)}/unload`)
  })
})
