import { afterEach, describe, expect, test } from 'bun:test'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import {
  _resetTmuxControlModeProbeForTesting,
  isFullscreenEnvEnabled,
} from '../../utils/fullscreen.js'
import { call } from './tui.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_DISABLE_ALT = process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN
const ORIGINAL_TMUX = process.env.TMUX
const ORIGINAL_TERM_PROGRAM = process.env.TERM_PROGRAM
const ORIGINAL_TERM = process.env.TERM

function restoreEnv() {
  if (ORIGINAL_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = ORIGINAL_NO_FLICKER
  }
  if (ORIGINAL_DISABLE_ALT === undefined) {
    delete process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN
  } else {
    process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN = ORIGINAL_DISABLE_ALT
  }
  if (ORIGINAL_TMUX === undefined) {
    delete process.env.TMUX
  } else {
    process.env.TMUX = ORIGINAL_TMUX
  }
  if (ORIGINAL_TERM_PROGRAM === undefined) {
    delete process.env.TERM_PROGRAM
  } else {
    process.env.TERM_PROGRAM = ORIGINAL_TERM_PROGRAM
  }
  if (ORIGINAL_TERM === undefined) {
    delete process.env.TERM
  } else {
    process.env.TERM = ORIGINAL_TERM
  }
  _resetTmuxControlModeProbeForTesting()
}

function clearRendererOverrides() {
  delete process.env.CLAUDE_CODE_NO_FLICKER
  delete process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN
  delete process.env.TMUX
  delete process.env.TERM_PROGRAM
  _resetTmuxControlModeProbeForTesting()
}

describe('/tui command', () => {
  afterEach(() => {
    restoreEnv()
    saveGlobalConfig(current => ({
      ...current,
      flickerFreeMode: undefined,
    }))
  })

  test('prints renderer status', async () => {
    clearRendererOverrides()

    const result = await call('', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('TUI renderer: flicker-free')
    expect(result.value).toContain('Saved setting: default (flicker-free)')
  })

  test('enables flicker-free rendering', async () => {
    clearRendererOverrides()

    const result = await call('flicker-free', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(true)
    if (result.type !== 'text') return
    expect(result.value).toContain('Flicker-free TUI enabled.')
  })

  test('keeps fullscreen alias for flicker-free rendering', async () => {
    clearRendererOverrides()

    const result = await call('fullscreen', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(true)
    if (result.type !== 'text') return
    expect(result.value).toContain('Flicker-free TUI enabled.')
  })

  test('enables classic rendering', async () => {
    clearRendererOverrides()

    const result = await call('classic', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(false)
    if (result.type !== 'text') return
    expect(result.value).toContain('Classic terminal renderer enabled.')
  })

  test('keeps default alias for classic rendering', async () => {
    clearRendererOverrides()

    const result = await call('default', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(false)
    if (result.type !== 'text') return
    expect(result.value).toContain('Classic terminal renderer enabled.')
  })

  test('reports environment override', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '0'

    const result = await call('fullscreen', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(true)
    expect(isFullscreenEnvEnabled()).toBe(false)
    if (result.type !== 'text') return
    expect(result.value).toContain(
      'Flicker-free TUI saved, but the active renderer is still classic.',
    )
    expect(result.value).toContain('CLAUDE_CODE_NO_FLICKER=0')
  })

  test('reports forced flicker-free override when saving classic', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '1'

    const result = await call('classic', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(false)
    expect(isFullscreenEnvEnabled()).toBe(true)
    if (result.type !== 'text') return
    expect(result.value).toContain(
      'Classic renderer saved, but the active renderer is still flicker-free.',
    )
    expect(result.value).toContain('CLAUDE_CODE_NO_FLICKER=1')
  })

  test('supports force-classic alternate-screen override', async () => {
    process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN = '1'

    const result = await call('fullscreen', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(true)
    expect(isFullscreenEnvEnabled()).toBe(false)
    if (result.type !== 'text') return
    expect(result.value).toContain('CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1')
  })

  test('reports tmux control mode guard', async () => {
    process.env.TMUX = '/tmp/tmux-501/default,123,0'
    process.env.TERM_PROGRAM = 'iTerm.app'
    process.env.TERM = 'xterm-256color'
    _resetTmuxControlModeProbeForTesting()

    const result = await call('fullscreen', {} as never)

    expect(result.type).toBe('text')
    expect(getGlobalConfig().flickerFreeMode).toBe(true)
    expect(isFullscreenEnvEnabled()).toBe(false)
    if (result.type !== 'text') return
    expect(result.value).toContain(
      'Flicker-free TUI saved, but the active renderer is still classic.',
    )
    expect(result.value).toContain('tmux control mode')
  })
})
