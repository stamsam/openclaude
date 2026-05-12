import { describe, expect, test } from 'bun:test'
import {
  buildTelegramSetupGuide,
  buildTelegramSessionStatus,
  buildTelegramSessionTaskSummary,
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
    expect(text).toContain('  /tasks')
  })

  test('session status includes task summary when provided', () => {
    const text = buildTelegramSessionStatus({
      enabled: true,
      connected: true,
      paused: false,
      workspace: '/tmp/project',
      taskSummary: 'Tasks: 1 open / 1 total',
    })

    expect(text).toContain('Telegram bridge: on')
    expect(text).toContain('Tasks: 1 open / 1 total')
  })

  test('session task summary uses app task descriptions', () => {
    const text = buildTelegramSessionTaskSummary({
      'task-1': {
        id: 'task-1',
        status: 'running',
        description: 'Check Telegram status',
      },
    })

    expect(text).toContain('Tasks: 1 open / 1 total')
    expect(text).toContain('- #task-1 [running] Check Telegram status')
  })
})
