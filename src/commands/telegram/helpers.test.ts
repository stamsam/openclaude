import { describe, expect, test } from 'bun:test'
import {
  buildTelegramSetupGuide,
  parseTelegramSlashArgs,
} from './helpers.js'

describe('telegram slash helpers', () => {
  test('parses toggle and setup actions', () => {
    expect(parseTelegramSlashArgs('')).toEqual({ kind: 'toggle' })
    expect(parseTelegramSlashArgs('setup')).toEqual({ kind: 'setup' })
    expect(parseTelegramSlashArgs('status')).toEqual({ kind: 'status' })
    expect(parseTelegramSlashArgs('off')).toEqual({ kind: 'off' })
  })

  test('setup guide shows missing values clearly', () => {
    const text = buildTelegramSetupGuide({
      cwd: '/tmp/project',
      env: {},
    })
    expect(text).toContain('TELEGRAM_BOT_TOKEN: missing')
    expect(text).toContain('TELEGRAM_ALLOWED_USER_ID: missing')
    expect(text).toContain('/telegram to turn the bridge on')
  })
})
