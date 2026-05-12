import { afterEach, expect, mock, test } from 'bun:test'
import {
  benchmarkModel,
  isBenchmarkSupported,
} from './benchmark.js'

const originalEnv = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OMLX_API_KEY: process.env.OMLX_API_KEY,
}
const originalFetch = globalThis.fetch

function restoreEnv(key: keyof typeof originalEnv): void {
  const value = originalEnv[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(() => {
  mock.restore()
  globalThis.fetch = originalFetch
  restoreEnv('CLAUDE_CODE_USE_OPENAI')
  restoreEnv('OPENAI_BASE_URL')
  restoreEnv('OPENAI_API_KEY')
  restoreEnv('OMLX_API_KEY')
})

test('benchmark supports local oMLX endpoints without OpenAI credentials', async () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8000/v1'
  delete process.env.OPENAI_API_KEY
  delete process.env.OMLX_API_KEY

  expect(isBenchmarkSupported()).toBe(true)

  globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    expect(url).toBe('http://127.0.0.1:8000/v1/chat/completions')
    const authorization = (init?.headers as Record<string, string>).Authorization
    expect(
      authorization === undefined || authorization.startsWith('Bearer '),
    ).toBe(true)

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
          ),
        )
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return Promise.resolve(new Response(stream, { status: 200 }))
  }) as unknown as typeof globalThis.fetch

  const result = await benchmarkModel('local-model')
  expect(result.success).toBe(true)
  expect(result.totalTokens).toBeGreaterThan(0)
})

test('benchmark sends oMLX settings key when available in env', async () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8000/v1'
  process.env.OMLX_API_KEY = 'local-key'
  delete process.env.OPENAI_API_KEY

  globalThis.fetch = mock((_input: string | URL | Request, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer local-key',
    )
    return Promise.resolve(
      new Response('data: [DONE]\n\n', {
        status: 200,
      }),
    )
  }) as unknown as typeof globalThis.fetch

  await benchmarkModel('local-model')
})
