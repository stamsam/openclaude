import { describe, expect, test } from 'bun:test'
import { AppStateProvider } from '../state/AppState.js'
import { renderToString } from '../utils/staticRender.js'
import { ContextPercentIndicator } from './ContextPercentIndicator.js'

describe('ContextPercentIndicator', () => {
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
