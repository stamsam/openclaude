import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  describeTelegramBridgeConfig,
  loadTelegramBridgeConfig,
} from '../config.js'

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oc-telegram-config-'))
  mkdirSync(join(dir, 'repo'))
  return join(dir, 'repo')
}

describe('telegram bridge config', () => {
  test('loads required env vars', () => {
    const workspace = makeWorkspace()
    const config = loadTelegramBridgeConfig({
      TELEGRAM_BOT_TOKEN: '123:secret',
      TELEGRAM_ALLOWED_USER_ID: '42',
      OPENCLAUDE_WORKSPACE_DIR: workspace,
    })
    expect(config.allowedUserId).toBe('42')
    expect(config.grpcHost).toBe('127.0.0.1')
    expect(config.grpcPort).toBe(50051)
    rmSync(workspace.replace(/\/repo$/, ''), { recursive: true, force: true })
  })

  test('rejects non-loopback grpc target without override', () => {
    const workspace = makeWorkspace()
    expect(() =>
      loadTelegramBridgeConfig({
        TELEGRAM_BOT_TOKEN: '123:secret',
        TELEGRAM_ALLOWED_USER_ID: '42',
        OPENCLAUDE_WORKSPACE_DIR: workspace,
        OPENCLAUDE_GRPC_HOST: '10.0.0.8',
      }),
    ).toThrow('Refusing to use non-loopback gRPC target')
    rmSync(workspace.replace(/\/repo$/, ''), { recursive: true, force: true })
  })

  test('redacts bot token in config description', () => {
    const workspace = makeWorkspace()
    const config = loadTelegramBridgeConfig({
      TELEGRAM_BOT_TOKEN: '123:super-secret-token',
      TELEGRAM_ALLOWED_USER_ID: '42',
      OPENCLAUDE_WORKSPACE_DIR: workspace,
    })
    const description = describeTelegramBridgeConfig(config)
    expect(description).toContain('<redacted>')
    expect(description).not.toContain('super-secret-token')
    rmSync(workspace.replace(/\/repo$/, ''), { recursive: true, force: true })
  })
})
