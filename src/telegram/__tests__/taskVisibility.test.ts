import { describe, expect, test } from 'bun:test'
import { formatTelegramTaskVisibility } from '../taskVisibility.js'

describe('telegram task visibility', () => {
  test('formats empty task visibility', () => {
    expect(formatTelegramTaskVisibility([])).toBe('Tasks: none found')
  })

  test('summarizes and sorts open tasks before terminal tasks', () => {
    const text = formatTelegramTaskVisibility([
      {
        id: '3',
        status: 'completed',
        subject: 'Done already',
      },
      {
        id: '2',
        status: 'pending',
        subject: 'Write docs',
      },
      {
        id: '1',
        status: 'in_progress',
        subject: 'Wire status command',
        owner: 'telegram',
      },
    ])

    expect(text).toContain('Tasks: 2 open / 3 total')
    expect(text).toContain('By status: in_progress 1, pending 1, completed 1')
    expect(text).toContain('- #1 [in_progress] Wire status command | owner: telegram')
    expect(text).toContain('- #2 [pending] Write docs')
    expect(text).not.toContain('Done already')
  })

  test('reports unavailable task visibility', () => {
    expect(
      formatTelegramTaskVisibility([], {
        unavailableReason: 'Task list could not be read.',
      }),
    ).toBe('Tasks: unavailable\nTask list could not be read.')
  })
})
