import { expect, test } from 'bun:test'

import { summarizeOmlxStatsPayload } from './localRuntimeStatus.js'

test('summarizeOmlxStatsPayload reports total cached tokens and top cached models', () => {
  expect(
    summarizeOmlxStatsPayload(
      {
        total_cached_tokens: 17578496,
        per_model: {
          alpha: { cached_tokens: 10 },
          beta: { cached_tokens: 3000 },
          gamma: { cached_tokens: 2000 },
          empty: { cached_tokens: 0 },
        },
      },
      'now',
    ),
  ).toEqual({
    updatedAt: 'now',
    totalCachedTokens: '17.6m',
    topCachedModels: ['beta 3k', 'gamma 2k', 'alpha 10'],
  })
})

test('summarizeOmlxStatsPayload ignores missing cache data', () => {
  expect(summarizeOmlxStatsPayload(undefined)).toBeUndefined()
  expect(
    summarizeOmlxStatsPayload({
      per_model: {
        alpha: { cached_tokens: 0 },
      },
    }),
  ).toBeUndefined()
})
