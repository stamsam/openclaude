import { describe, expect, test } from 'bun:test'

import { formatProviderProfilesSummary } from './HomeDashboard.js'
import { findSearchMatchIndex } from './AttachPanel.js'

describe('HomeDashboard provider summary formatting', () => {
  test('includes provider, model, and base url when present', () => {
    expect(formatProviderProfilesSummary([
      {
        id: 'local',
        name: 'Local',
        provider: 'oMLX',
        model: 'local-router',
        baseUrl: 'http://localhost:11434/v1',
      },
    ])).toEqual([
      'Local: oMLX/local-router @ http://localhost:11434/v1',
    ])
  })

  test('falls back to profile id when name is missing', () => {
    expect(formatProviderProfilesSummary([
      {
        id: 'profile_a',
        provider: 'OpenAI',
        model: 'gpt-4.1',
      },
    ])).toEqual([
      'profile_a: OpenAI/gpt-4.1',
    ])
  })

  test('finds the first matching line for thread search', () => {
    expect(findSearchMatchIndex([
      'You: hello',
      'Agent: working on it',
      'Agent: search target',
    ], 'search')).toBe(2)
  })

  test('returns -1 when the search query is empty or absent', () => {
    expect(findSearchMatchIndex(['You: hello'], '')).toBe(-1)
    expect(findSearchMatchIndex(['You: hello'], 'missing')).toBe(-1)
  })
})
