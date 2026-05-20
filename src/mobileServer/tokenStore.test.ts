import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMobileServerDeviceToken,
  getMobileServerTokenStorePath,
  getOrCreateMobileServerToken,
  readMobileServerTokens,
  resetMobileServerTokens,
} from './tokenStore.js'

let previousConfigDir: string | undefined
let testConfigDir: string | undefined

describe('mobile server token store', () => {
  beforeEach(() => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    testConfigDir = mkdtempSync(join(tmpdir(), 'sam-mobile-token-store-'))
    process.env.CLAUDE_CONFIG_DIR = testConfigDir
  })

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    if (testConfigDir) {
      rmSync(testConfigDir, { recursive: true, force: true })
    }
  })

  test('creates, reuses, appends, and resets tokens', () => {
    let sequence = 0
    const createToken = () => `sam-test-token-${++sequence}-abcdefghijkl`

    const first = getOrCreateMobileServerToken(createToken)
    expect(first).toBe('sam-test-token-1-abcdefghijkl')
    expect(getOrCreateMobileServerToken(createToken)).toBe(first)

    const second = createMobileServerDeviceToken(createToken)
    expect(second).toBe('sam-test-token-2-abcdefghijkl')
    expect(readMobileServerTokens()).toEqual([first, second])

    const reset = resetMobileServerTokens(createToken)
    expect(reset).toBe('sam-test-token-3-abcdefghijkl')
    expect(readMobileServerTokens()).toEqual([reset])
  })

  test('ignores corrupt stores and malformed token records', () => {
    writeFileSync(getMobileServerTokenStorePath(), '{', 'utf8')
    expect(readMobileServerTokens()).toEqual([])

    writeFileSync(
      getMobileServerTokenStorePath(),
      JSON.stringify({
        version: 1,
        devices: [
          { id: 'bad', token: 'not-valid', createdAt: 'now' },
          { id: 'ok', token: 'sam-valid_token-123456789', createdAt: 'now' },
        ],
      }),
      'utf8',
    )
    expect(readMobileServerTokens()).toEqual(['sam-valid_token-123456789'])
  })

  test('writes token store with private file permissions', () => {
    resetMobileServerTokens(() => 'sam-private-mode-token')

    const mode = statSync(getMobileServerTokenStorePath()).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
