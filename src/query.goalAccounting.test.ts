import { expect, test } from 'bun:test'

import {
  getStreamEventTextDelta,
  getStreamingTextDeltaTokenEstimate,
} from './query.js'

test('goal accounting can estimate streamed text deltas when provider usage is missing', () => {
  const text =
    'Local providers often stream text without returning usage, so the goal footer still needs motion.'

  expect(getStreamingTextDeltaTokenEstimate(text)).toBeGreaterThan(0)
})

test('goal accounting estimates visible stream deltas when provider usage is missing', () => {
  expect(
    getStreamEventTextDelta({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hello' },
    } as Parameters<typeof getStreamEventTextDelta>[0]),
  ).toBe('hello')

  expect(
    getStreamEventTextDelta({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'working' },
    } as Parameters<typeof getStreamEventTextDelta>[0]),
  ).toBe('working')

  expect(
    getStreamEventTextDelta({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"x":' },
    } as Parameters<typeof getStreamEventTextDelta>[0]),
  ).toBe('{"x":')
})
