import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWithCwdOverride } from '../../utils/cwd.js'
import { call, parseServerAction } from './server.js'
import type { LocalCommandResult } from '../../types/command.js'
import { readMobileServerTokens } from '../../mobileServer/tokenStore.js'

const repoRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)))
let previousConfigDir: string | undefined
let previousMobileServerPort: string | undefined
let testConfigDir: string | undefined

function textValue(result: LocalCommandResult): string {
  if (result.type !== 'text') {
    throw new Error(`Expected text result, got ${result.type}`)
  }
  return result.value
}

describe('/server command', () => {
  beforeEach(() => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    previousMobileServerPort = process.env.OPENCLAUDE_MOBILE_SERVER_PORT
    testConfigDir = mkdtempSync(join(tmpdir(), 'sam-mobile-server-'))
    process.env.CLAUDE_CONFIG_DIR = testConfigDir
    delete process.env.OPENCLAUDE_MOBILE_SERVER_PORT
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
    if (previousMobileServerPort === undefined) {
      delete process.env.OPENCLAUDE_MOBILE_SERVER_PORT
    } else {
      process.env.OPENCLAUDE_MOBILE_SERVER_PORT = previousMobileServerPort
    }
  })

  test('parses mobile server actions', () => {
    expect(parseServerAction('')).toBe('start')
    expect(parseServerAction('local')).toBe('local')
    expect(parseServerAction('status')).toBe('status')
    expect(parseServerAction('off')).toBe('stop')
    expect(parseServerAction('ts')).toBe('tailscale')
    expect(parseServerAction('pair')).toBe('pair')
    expect(parseServerAction('token')).toBe('pair')
    expect(parseServerAction('revoke')).toBe('reset-token')
    expect(parseServerAction('wat')).toBe('help')
  })

  test('local enables a Mac-only mobile server with token auth', async () => {
    let appState: any = {
      mobileServerConfigVersion: 0,
    }
    const result = await runWithCwdOverride(repoRoot, () =>
      call('local', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    expect(result.type).toBe('text')
    expect(appState.mobileServerEnabled).toBe(true)
    expect(appState.mobileServerHost).toBe('127.0.0.1')
    expect(appState.mobileServerPort).toBeGreaterThan(0)
    expect(appState.mobileServerToken).toMatch(/^sam-/)
    expect(appState.mobileServerUrl).toBe(`http://127.0.0.1:${appState.mobileServerPort}/`)
    expect(appState.mobileServerConfigVersion).toBe(1)
  })

  test('start stays local even when Tailscale is available', async () => {
    const previousTailscaleIp = process.env.TAILSCALE_IP
    process.env.TAILSCALE_IP = '100.64.0.9'
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    try {
      const result = await runWithCwdOverride(repoRoot, () =>
        call('', {
          getAppState: () => appState,
          setAppState: updater => {
            appState = updater(appState)
          },
        } as any),
      )

      const value = textValue(result)
      expect(appState.mobileServerHost).toBe('127.0.0.1')
      expect(appState.mobileServerTailscaleUrl).toBeUndefined()
      expect(value).toContain('Phone URL: off by default')
    } finally {
      if (previousTailscaleIp === undefined) {
        delete process.env.TAILSCALE_IP
      } else {
        process.env.TAILSCALE_IP = previousTailscaleIp
      }
    }
  })

  test('tailscale binds to the Tailscale interface explicitly', async () => {
    const previousTailscaleIp = process.env.TAILSCALE_IP
    process.env.TAILSCALE_IP = '100.64.0.9'
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    try {
      const result = await runWithCwdOverride(repoRoot, () =>
        call('tailscale', {
          getAppState: () => appState,
          setAppState: updater => {
            appState = updater(appState)
          },
        } as any),
      )

      const value = textValue(result)
      expect(appState.mobileServerHost).toBe('100.64.0.9')
      expect(appState.mobileServerTailscaleUrl).toBe('http://100.64.0.9:4097/')
      expect(value).toContain('Phone URL: http://100.64.0.9:4097/?token=sam-')
      expect(value).toContain('Pairing QR:')
    } finally {
      if (previousTailscaleIp === undefined) {
        delete process.env.TAILSCALE_IP
      } else {
        process.env.TAILSCALE_IP = previousTailscaleIp
      }
    }
  })

  test('tailscale formats IPv6 phone URLs with brackets', async () => {
    const previousTailscaleIp = process.env.TAILSCALE_IP
    process.env.TAILSCALE_IP = 'fd7a:115c:a1e0::1'
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    try {
      const result = await runWithCwdOverride(repoRoot, () =>
        call('tailscale', {
          getAppState: () => appState,
          setAppState: updater => {
            appState = updater(appState)
          },
        } as any),
      )

      const value = textValue(result)
      expect(appState.mobileServerHost).toBe('fd7a:115c:a1e0::1')
      expect(appState.mobileServerTailscaleUrl).toBe(
        'http://[fd7a:115c:a1e0::1]:4097/',
      )
      expect(value).toContain(
        'Phone URL: http://[fd7a:115c:a1e0::1]:4097/?token=sam-',
      )
    } finally {
      if (previousTailscaleIp === undefined) {
        delete process.env.TAILSCALE_IP
      } else {
        process.env.TAILSCALE_IP = previousTailscaleIp
      }
    }
  })

  test('tailscale rejects invalid IPv4 octets from env', async () => {
    const previousTailscaleIp = process.env.TAILSCALE_IP
    process.env.TAILSCALE_IP = '999.999.999.999'
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    try {
      const result = await runWithCwdOverride(repoRoot, () =>
        call('tailscale', {
          getAppState: () => appState,
          setAppState: updater => {
            appState = updater(appState)
          },
        } as any),
      )

      const value = textValue(result)
      expect(appState.mobileServerHost).toBe('127.0.0.1')
      expect(appState.mobileServerTailscaleUrl).toBeUndefined()
      expect(value).toContain('Tailscale URL: unavailable')
    } finally {
      if (previousTailscaleIp === undefined) {
        delete process.env.TAILSCALE_IP
      } else {
        process.env.TAILSCALE_IP = previousTailscaleIp
      }
    }
  })

  test('tailscale without an available Tailscale IP stays loopback', async () => {
    const previousTailscaleIp = process.env.TAILSCALE_IP
    process.env.TAILSCALE_IP = 'not-an-ip'
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    try {
      const result = await runWithCwdOverride(repoRoot, () =>
        call('tailscale', {
          getAppState: () => appState,
          setAppState: updater => {
            appState = updater(appState)
          },
        } as any),
      )

      const value = textValue(result)
      expect(appState.mobileServerHost).toBe('127.0.0.1')
      expect(appState.mobileServerTailscaleUrl).toBeUndefined()
      expect(value).toContain('Tailscale URL: unavailable')
    } finally {
      if (previousTailscaleIp === undefined) {
        delete process.env.TAILSCALE_IP
      } else {
        process.env.TAILSCALE_IP = previousTailscaleIp
      }
    }
  })


  test('pair creates a new token without breaking existing paired devices', async () => {
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    await runWithCwdOverride(repoRoot, () =>
      call('local', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )
    const firstToken = appState.mobileServerToken

    const result = await runWithCwdOverride(repoRoot, () =>
      call('pair', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    const value = textValue(result)
    expect(appState.mobileServerToken).toMatch(/^sam-/)
    expect(appState.mobileServerToken).not.toBe(firstToken)
    expect(appState.mobileServerConfigVersion).toBe(2)
    expect(readMobileServerTokens()).toEqual([firstToken, appState.mobileServerToken])
    expect(value).toContain('new Sam mobile device token')
  })

  test('pair preserves existing phone bind when adding a device', async () => {
    let appState: any = {
      mobileServerEnabled: true,
      mobileServerConnected: true,
      mobileServerHost: '100.64.0.9',
      mobileServerPort: 4097,
      mobileServerTailscaleHost: '100.64.0.9',
      mobileServerTailscaleUrl: 'http://100.64.0.9:4097/',
      mobileServerToken: 'sam-existing',
      mobileServerConfigVersion: 1,
    }

    const result = await runWithCwdOverride(repoRoot, () =>
      call('pair', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    const value = textValue(result)
    expect(appState.mobileServerHost).toBe('100.64.0.9')
    expect(appState.mobileServerTailscaleHost).toBe('100.64.0.9')
    expect(value).toContain('Phone URL: http://100.64.0.9:4097/?token=sam-')
    expect(value).toContain('Pairing QR:')
  })

  test('honors valid port env and ignores invalid port env', async () => {
    let appState: any = {
      mobileServerConfigVersion: 0,
    }
    process.env.OPENCLAUDE_MOBILE_SERVER_PORT = '5123'

    const valid = await runWithCwdOverride(repoRoot, () =>
      call('local', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    expect(appState.mobileServerPort).toBe(5123)
    expect(textValue(valid)).toContain('http://127.0.0.1:5123/?token=sam-')

    appState = {
      mobileServerConfigVersion: 0,
    }
    process.env.OPENCLAUDE_MOBILE_SERVER_PORT = '99999'

    await runWithCwdOverride(repoRoot, () =>
      call('local', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    expect(appState.mobileServerPort).toBe(4097)
  })

  test('start falls back to process cwd when app cwd state is stale', async () => {
    let appState: any = {
      mobileServerConfigVersion: 0,
    }

    await runWithCwdOverride('C:\\repo', () =>
      call('', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    expect(appState.mobileServerEnabled).toBe(true)
    expect(appState.mobileServerWorkspaceDir).toBe(repoRoot)
  })

  test('stop disables the in-session mobile server', async () => {
    let appState: any = {
      mobileServerEnabled: true,
      mobileServerConnected: true,
      mobileServerUrl: 'http://127.0.0.1:4097/?token=sam-test',
    }
    await call('stop', {
      getAppState: () => appState,
      setAppState: updater => {
        appState = updater(appState)
      },
    } as any)

    expect(appState.mobileServerEnabled).toBe(false)
    expect(appState.mobileServerConnected).toBe(false)
    expect(appState.mobileServerUrl).toBeUndefined()
  })

  test('start reuses an existing server instead of forcing a restart', async () => {
    let didSetState = false
    const result = await call('', {
      getAppState: () => ({
        mobileServerEnabled: true,
        mobileServerConnected: true,
        mobileServerUrl: 'http://127.0.0.1:4097/?token=sam-existing',
      }),
      setAppState: () => {
        didSetState = true
      },
    } as any)

    const value = textValue(result)
    expect(didSetState).toBe(false)
    expect(value).toContain('Sam mobile server: on')
    expect(value).toContain('token=redacted')
    expect(value).not.toContain('sam-existing')
  })

  test('start retries when the enabled server has an error', async () => {
    let appState: any = {
      mobileServerEnabled: true,
      mobileServerConnected: false,
      mobileServerError: 'EADDRINUSE',
      mobileServerConfigVersion: 4,
    }

    const result = await runWithCwdOverride(repoRoot, () =>
      call('', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    const value = textValue(result)
    expect(value).toContain('Starting Sam mobile server')
    expect(appState.mobileServerError).toBeUndefined()
    expect(appState.mobileServerConfigVersion).toBe(5)
  })

  test('local can force an already enabled phone server back to loopback', async () => {
    let appState: any = {
      mobileServerEnabled: true,
      mobileServerConnected: true,
      mobileServerHost: '100.64.0.9',
      mobileServerPort: 4097,
      mobileServerToken: 'sam-existing',
      mobileServerTailscaleUrl: 'http://100.64.0.9:4097/?token=sam-existing',
      mobileServerConfigVersion: 1,
    }

    const result = await runWithCwdOverride(repoRoot, () =>
      call('local', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    textValue(result)
    expect(appState.mobileServerEnabled).toBe(true)
    expect(appState.mobileServerHost).toBe('127.0.0.1')
    expect(appState.mobileServerTailscaleUrl).toBeUndefined()
    expect(appState.mobileServerConfigVersion).toBe(2)
  })

  test('reset-token revokes tokens but returns to local-only bind', async () => {
    let appState: any = {
      mobileServerEnabled: true,
      mobileServerConnected: true,
      mobileServerHost: '100.64.0.9',
      mobileServerPort: 4097,
      mobileServerToken: 'sam-existing',
      mobileServerTailscaleHost: '100.64.0.9',
      mobileServerTailscaleUrl: 'http://100.64.0.9:4097/',
      mobileServerConfigVersion: 1,
    }

    await runWithCwdOverride(repoRoot, () =>
      call('reset-token', {
        getAppState: () => appState,
        setAppState: updater => {
          appState = updater(appState)
        },
      } as any),
    )

    expect(appState.mobileServerHost).toBe('127.0.0.1')
    expect(appState.mobileServerTailscaleHost).toBeUndefined()
    expect(appState.mobileServerTailscaleUrl).toBeUndefined()
    expect(appState.mobileServerToken).not.toBe('sam-existing')
    expect(readMobileServerTokens()).toEqual([appState.mobileServerToken])
    expect(readMobileServerTokens()).not.toContain('sam-existing')
  })
})
