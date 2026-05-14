import { describe, expect, test } from 'bun:test'

import { conversationFromLog } from './AttachPanel.js'

function logLine(value: Record<string, unknown>): string {
  return `${JSON.stringify(value)}\n`
}

describe('AgentAttachPanel conversation log rendering', () => {
  test('hides local command replay breadcrumbs from thread conversation', () => {
    const raw = [
      logLine({
        type: 'user',
        isReplay: true,
        message: {
          role: 'user',
          content: '<local-command-stdout>Set model to deepseek</local-command-stdout>',
        },
      }),
      logLine({
        type: 'user',
        message: {
          role: 'user',
          content: 'hello',
        },
      }),
      logLine({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hi there' }],
        },
      }),
    ].join('')

    expect(conversationFromLog(raw)).toEqual([
      { role: 'You', text: 'hello' },
      { role: 'Agent', text: 'hi there' },
    ])
  })
})
