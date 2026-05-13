import { afterEach, expect, mock, test } from 'bun:test'
import {
  shouldAutoUnloadPreviousLocalModel,
  unloadPreviousOmlxModelAfterSwitch,
} from './omlxModelLifecycle.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

test('auto unload preflight only applies to changed oMLX models', () => {
  expect(
    shouldAutoUnloadPreviousLocalModel(true, 'old', 'new', {
      OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
    }),
  ).toMatchObject({ attempted: true })

  expect(
    shouldAutoUnloadPreviousLocalModel(false, 'old', 'new', {
      OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
    }),
  ).toEqual({ attempted: false, reason: 'disabled' })

  expect(
    shouldAutoUnloadPreviousLocalModel(true, 'same', 'same', {
      OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
    }),
  ).toEqual({ attempted: false, reason: 'same_model' })

  expect(
    shouldAutoUnloadPreviousLocalModel(true, 'old', 'new', {
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    }),
  ).toEqual({ attempted: false, reason: 'not_omlx' })
})

test('unload calls oMLX unload endpoint with auth when available', async () => {
  const fetchMock = mock(async () => new Response('{}', { status: 200 }))
  globalThis.fetch = fetchMock as typeof fetch

  const result = await unloadPreviousOmlxModelAfterSwitch({
    enabled: true,
    previousModel: 'old model',
    nextModel: 'new model',
    processEnv: {
      OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
      OMLX_API_KEY: 'test-key',
    },
  })

  expect(result).toEqual({ attempted: true, ok: true, status: 200 })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:8000/v1/models/old%20model/unload',
    expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
    }),
  )
})

test('unload treats already-unloaded or missing models as non-fatal', async () => {
  globalThis.fetch = mock(async () => new Response('{}', { status: 404 })) as typeof fetch

  await expect(
    unloadPreviousOmlxModelAfterSwitch({
      enabled: true,
      previousModel: 'old',
      nextModel: 'new',
      processEnv: {
        OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
      },
    }),
  ).resolves.toEqual({ attempted: true, ok: true, status: 404 })
})
