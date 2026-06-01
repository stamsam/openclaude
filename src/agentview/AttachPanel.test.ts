import { describe, expect, test } from 'bun:test'

import { conversationFromLog, mergeConversationTurns } from './AttachPanel.js'

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

  test('keeps submitted user text visible before the job log catches up', () => {
    expect(
      mergeConversationTurns(
        [{ role: 'Agent', text: 'what now?' }],
        [{ role: 'You', text: 'experiment' }],
      ),
    ).toEqual([
      { role: 'Agent', text: 'what now?' },
      { role: 'You', text: 'experiment' },
    ])
  })

  test('keeps the full parsed conversation instead of only the last few turns', () => {
    const raw = Array.from({ length: 12 }, (_, index) => logLine({
      type: index % 2 === 0 ? 'user' : 'assistant',
      message: {
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `turn ${index}`,
      },
    })).join('')

    const turns = conversationFromLog(raw)

    expect(turns).toHaveLength(12)
    expect(turns[0]).toEqual({ role: 'You', text: 'turn 0' })
    expect(turns.at(-1)).toEqual({ role: 'Agent', text: 'turn 11' })
  })

  test('keeps all merged log and optimistic turns', () => {
    const logTurns = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'You' : 'Agent',
      text: `log ${index}`,
    }))
    const optimisticTurns = [
      { role: 'You', text: 'pending 1' },
      { role: 'You', text: 'pending 2' },
    ]

    const turns = mergeConversationTurns(logTurns, optimisticTurns)

    expect(turns).toHaveLength(14)
    expect(turns[0]).toEqual({ role: 'You', text: 'log 0' })
    expect(turns.at(-1)).toEqual({ role: 'You', text: 'pending 2' })
  })

  test('dedupes optimistic user text once it is present in the job log', () => {
    expect(
      mergeConversationTurns(
        [
          { role: 'Agent', text: 'what now?' },
          { role: 'You', text: 'experiment' },
          { role: 'Agent', text: 'nice' },
        ],
        [{ role: 'You', text: 'experiment' }],
      ),
    ).toEqual([
      { role: 'Agent', text: 'what now?' },
      { role: 'You', text: 'experiment' },
      { role: 'Agent', text: 'nice' },
    ])
  })
})
