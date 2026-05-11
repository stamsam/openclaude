import { describe, expect, test } from 'bun:test'
import {
  TELEGRAM_TEXT_LIMIT,
  splitTelegramMessage,
} from '../messageChunking.js'

describe('telegram chunking', () => {
  test('keeps short text in one chunk', () => {
    expect(splitTelegramMessage('hello')).toEqual(['hello'])
  })

  test('splits long text under limit', () => {
    const input = 'a'.repeat(TELEGRAM_TEXT_LIMIT + 200)
    const chunks = splitTelegramMessage(input)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= TELEGRAM_TEXT_LIMIT)).toBe(
      true,
    )
  })

  test('prefers newline boundaries when available', () => {
    const input = `${'a'.repeat(3000)}\n${'b'.repeat(2000)}`
    const chunks = splitTelegramMessage(input, 3500)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.endsWith('a')).toBe(true)
    expect(chunks[1]?.startsWith('b')).toBe(true)
  })
})
