import { describe, expect, test } from 'bun:test'
import {
  buildBtwPrompt,
  getTelegramHelpText,
  parseTelegramCommand,
} from '../commands.js'

describe('telegram command parsing', () => {
  test('plain text defaults to ask', () => {
    expect(parseTelegramCommand('summarize this repo')).toEqual({
      type: 'ask',
      prompt: 'summarize this repo',
    })
  })

  test('/btw parses with prompt', () => {
    expect(parseTelegramCommand('/btw what repo am I in?')).toEqual({
      type: 'btw',
      prompt: 'what repo am I in?',
    })
  })

  test('/dismiss aliases parse', () => {
    expect(parseTelegramCommand('/dismiss')).toEqual({ type: 'dismiss' })
    expect(parseTelegramCommand('/esc')).toEqual({ type: 'dismiss' })
    expect(parseTelegramCommand('/cancel')).toEqual({ type: 'dismiss' })
  })

  test('unknown slash command returns bad-command shape', () => {
    expect(parseTelegramCommand('/wat')).toEqual({
      type: 'unknown_command',
      command: '/wat',
    })
  })

  test('/approve requires an id', () => {
    expect(parseTelegramCommand('/approve abc123')).toEqual({
      type: 'approve',
      id: 'abc123',
    })
    expect(parseTelegramCommand('/approve')).toEqual({ type: 'help' })
  })

  test('btw prompt adds safety instructions', () => {
    const prompt = buildBtwPrompt('inspect package.json')
    expect(prompt).toContain('Telegram-native /btw side question.')
    expect(prompt).toContain('Do not affect the local OpenClaude conversation.')
    expect(prompt).toContain('Do not open or reference the local /btw modal.')
    expect(prompt).toContain('Do not edit files, run commands, or take actions.')
    expect(prompt).toContain('Side question: inspect package.json')
  })

  test('help text mentions btw', () => {
    expect(getTelegramHelpText()).toContain('/btw <prompt> - answer a Telegram-native side question')
    expect(getTelegramHelpText()).toContain('/dismiss - close the active local OpenClaude overlay only')
    expect(getTelegramHelpText()).not.toContain('/approve')
    expect(getTelegramHelpText()).not.toContain('/deny')
  })
})
