import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type MockProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'mistral'
  | 'github'
  | 'nvidia-nim'
  | 'minimax'
  | 'codex'

function mockProvider(
  provider: MockProvider,
  isFirstPartyAnthropicBaseUrl = false,
): void {
  mock.module('./providers.js', () => ({
    getAPIProvider: () => provider,
    getAPIProviderForStatsig: () => provider,
    isFirstPartyAnthropicBaseUrl: () => isFirstPartyAnthropicBaseUrl,
    isGithubNativeAnthropicMode: () => false,
    usesAnthropicAccountFlow: () => provider === 'firstParty',
  }))
}

async function importAgentModule(): Promise<typeof import('./agent.js')> {
  return import(`./agent.ts?agent-test=${Date.now()}-${Math.random()}`)
}

describe('getAgentModel provider-aware fallback', () => {
  beforeEach(() => {
    mock.module('./modelAllowlist.js', () => ({
      isModelAllowed: () => true,
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Claude-native providers', () => {
    test('haiku alias resolves to haiku model for official Anthropic API', async () => {
      mockProvider('firstParty', true)

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('haiku', 'claude-sonnet-4-6', undefined, 'default')

      expect(result).toContain('haiku')
      expect(result).not.toBe('claude-sonnet-4-6')
    })

    test.each([
      ['bedrock' as const],
      ['vertex' as const],
      ['foundry' as const],
    ])('haiku alias resolves for %s provider', async provider => {
      mockProvider(provider)

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('haiku', 'claude-sonnet-4-6', undefined, 'default')

      expect(result).toContain('haiku')
    })
  })

  describe('Non-Claude-native providers', () => {
    test.each([
      ['openai' as const, 'gpt-4o-mini'],
      ['gemini' as const, 'gemini-2.5-pro'],
      ['mistral' as const, 'mistral-small-latest'],
      ['github' as const, 'gpt-4o-mini'],
      ['nvidia-nim' as const, 'meta/llama-3.1-8b-instruct'],
      ['minimax' as const, 'MiniMax-M2.5-highspeed'],
      ['codex' as const, 'gpt-5.5-mini'],
    ])('haiku alias inherits parent model for %s provider', async (provider, parentModel) => {
      mockProvider(provider)

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('haiku', parentModel, undefined, 'default')

      expect(result).toBe(parentModel)
    })

    test('haiku alias inherits parent model for custom Anthropic-compatible URL', async () => {
      mockProvider('firstParty')

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('haiku', 'claude-sonnet-4-6', undefined, 'default')

      expect(result).toBe('claude-sonnet-4-6')
    })

    test('sonnet alias inherits parent model for OpenAI provider', async () => {
      mockProvider('openai')

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('sonnet', 'gpt-4o-mini', undefined, 'default')

      expect(result).toBe('gpt-4o-mini')
    })
  })

  describe('inherit behavior unchanged', () => {
    test('inherit always returns parent model regardless of provider', async () => {
      mockProvider('openai')

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel('inherit', 'gpt-4o', undefined, 'default')

      expect(result).toBe('gpt-4o')
    })
  })

  describe('tool-specified custom models', () => {
    test('accepts provider model IDs, not just family aliases', async () => {
      mockProvider('openai')

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel(
        undefined,
        'gpt-4o-mini',
        'gpt-5.3-codex-spark',
        'default',
      )

      expect(result).toBe('gpt-5.3-codex-spark')
    })

    test('allows explicit inherit as a tool model override', async () => {
      mockProvider('openai')

      const { getAgentModel } = await importAgentModule()
      const result = getAgentModel(
        'haiku',
        'gpt-4o-mini',
        ' inherit ',
        'default',
      )

      expect(result).toBe('gpt-4o-mini')
    })
  })

  describe('checkIsClaudeNativeProvider helper', () => {
    test('returns true for official Anthropic API', async () => {
      mockProvider('firstParty', true)

      const { checkIsClaudeNativeProvider } = await importAgentModule()
      expect(checkIsClaudeNativeProvider()).toBe(true)
    })

    test.each([
      ['bedrock' as const],
      ['vertex' as const],
      ['foundry' as const],
    ])('returns true for %s provider', async provider => {
      mockProvider(provider)

      const { checkIsClaudeNativeProvider } = await importAgentModule()
      expect(checkIsClaudeNativeProvider()).toBe(true)
    })

    test('returns false for OpenAI provider', async () => {
      mockProvider('openai')

      const { checkIsClaudeNativeProvider } = await importAgentModule()
      expect(checkIsClaudeNativeProvider()).toBe(false)
    })

    test('returns false for custom Anthropic URL', async () => {
      mockProvider('firstParty')

      const { checkIsClaudeNativeProvider } = await importAgentModule()
      expect(checkIsClaudeNativeProvider()).toBe(false)
    })
  })
})
