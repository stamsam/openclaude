import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMobileServerDeviceToken,
  getOrCreateMobileServerToken,
  readMobileServerTokens,
  resetMobileServerTokens,
} from './tokenStore.js'

let testConfigDir: string | undefined
let testStorePath: string

describe('mobile server token store', () => {
  beforeEach(() => {
    testConfigDir = mkdtempSync(join(tmpdir(), 'sam-mobile-token-store-'))
    testStorePath = join(testConfigDir, 'mobile-server-devices.json')
  })

  afterEach(() => {
    if (testConfigDir) {
      rmSync(testConfigDir, { recursive: true, force: true })
    }
  })

  test('creates, reuses, appends, and resets tokens', () => {
    let sequence = 0
    const createToken = () => `sam-test-token-${++sequence}-abcdefghijkl`

    const first = getOrCreateMobileServerToken(createToken, {
      storePath: testStorePath,
    })
    expect(first).toBe('sam-test-token-1-abcdefghijkl')
    expect(
      getOrCreateMobileServerToken(createToken, { storePath: testStorePath }),
    ).toBe(first)

    const second = createMobileServerDeviceToken(createToken, {
      storePath: testStorePath,
    })
    expect(second).toBe('sam-test-token-2-abcdefghijkl')
    expect(readMobileServerTokens({ storePath: testStorePath })).toEqual([
      first,
      second,
    ])

    const reset = resetMobileServerTokens(createToken, {
      storePath: testStorePath,
    })
    expect(reset).toBe('sam-test-token-3-abcdefghijkl')
    expect(readMobileServerTokens({ storePath: testStorePath })).toEqual([
      reset,
    ])
  })

  test('ignores corrupt stores and malformed token records', () => {
    writeFileSync(testStorePath, '{', 'utf8')
    expect(readMobileServerTokens({ storePath: testStorePath })).toEqual([])

    writeFileSync(
      testStorePath,
      JSON.stringify({
        version: 1,
        devices: [
          { id: 'bad', token: 'not-valid', createdAt: 'now' },
          { id: 'ok', token: 'sam-valid_token-123456789', createdAt: 'now' },
        ],
      }),
      'utf8',
    )
    expect(readMobileServerTokens({ storePath: testStorePath })).toEqual([
      'sam-valid_token-123456789',
    ])
  })

  test('writes token store with private file permissions', () => {
    resetMobileServerTokens(() => 'sam-private-mode-token', {
      storePath: testStorePath,
    })

    const mode = statSync(testStorePath).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
