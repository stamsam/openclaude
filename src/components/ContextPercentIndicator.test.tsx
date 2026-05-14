import { describe, expect, test } from 'bun:test'
import { AppStateProvider } from '../state/AppState.js'
import { renderToString } from '../utils/staticRender.js'
import { ContextPercentIndicator } from './ContextPercentIndicator.js'

describe('ContextPercentIndicator', () => {
  function assistantWithUsage(totalTokens: number) {
    return {
      type: 'assistant' as const,
      message: {
        id: `msg_${totalTokens}`,
        model: 'Qwen3.6-35B-A3B-oQ4-mtp',
        content: [{ type: 'text' as const, text: 'done' }],
        usage: {
          input_tokens: totalTokens,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }
  }

  test('renders a percentage when the context window is known', async () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          id: 'msg_1',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'done' }],
          usage: {
            input_tokens: 49_000,
            output_tokens: 1_000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]

    const output = await renderToString(
      <AppStateProvider>
        <ContextPercentIndicator messages={messages} model="claude-sonnet-4-5" />
      </AppStateProvider>,
      80,
    )

    expect(output).toContain('CTX 25%')
  })

  test('shows low but non-zero local context usage instead of rounding to zero', async () => {
    const originalOmlxContextWindow = process.env.OMLX_CONTEXT_WINDOW
    process.env.OMLX_CONTEXT_WINDOW = '1000000'

    try {
      const output = await renderToString(
        <AppStateProvider>
          <ContextPercentIndicator
            messages={[assistantWithUsage(3_000)]}
            model="Qwen3.6-35B-A3B-oQ4-mtp"
            providerBaseUrl="http://127.0.0.1:8000/v1"
          />
        </AppStateProvider>,
        80,
      )

      expect(output).toContain('CTX 0.3%')
    } finally {
      if (originalOmlxContextWindow === undefined) {
        delete process.env.OMLX_CONTEXT_WINDOW
      } else {
        process.env.OMLX_CONTEXT_WINDOW = originalOmlxContextWindow
      }
    }
  })

  test('renders unknown state when runtime metadata cannot resolve a context window', async () => {
    const originalUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
    const originalOpenAIModel = process.env.OPENAI_MODEL
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'unlisted-local-model'
    try {
      const output = await renderToString(
        <AppStateProvider>
          <ContextPercentIndicator messages={[]} model="unlisted-local-model" />
        </AppStateProvider>,
        80,
      )

      expect(output).toContain('CTX ?')
    } finally {
      if (originalUseOpenAI === undefined) {
        delete process.env.CLAUDE_CODE_USE_OPENAI
      } else {
        process.env.CLAUDE_CODE_USE_OPENAI = originalUseOpenAI
      }
      if (originalOpenAIModel === undefined) {
        delete process.env.OPENAI_MODEL
      } else {
        process.env.OPENAI_MODEL = originalOpenAIModel
      }
    }
  })
})
