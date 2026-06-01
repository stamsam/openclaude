import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import {
  isFullscreenEnvEnabled,
  isTmuxControlMode,
} from '../../utils/fullscreen.js'

const USAGE = `Usage: /tui [flicker-free|classic]

/tui              Show the active renderer
/tui flicker-free  Enable fixed prompt and smooth scroll
/tui classic       Use terminal scrollback`

function envOverrideMessage(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN)) {
    return 'CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 is set, so the classic renderer stays forced on for this process.'
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return 'CLAUDE_CODE_NO_FLICKER=1 is set, so flicker-free TUI stays forced on for this process.'
  }
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return 'CLAUDE_CODE_NO_FLICKER=0 is set, so flicker-free TUI stays forced off for this process.'
  }
  return null
}

function rendererBlockMessage(): string | null {
  const override = envOverrideMessage()
  if (override) return override
  if (isTmuxControlMode()) {
    return 'tmux control mode is active, so flicker-free TUI is disabled for this terminal. Start tmux without -CC or set CLAUDE_CODE_NO_FLICKER=1 to override.'
  }
  return null
}

function formatStatus(): string {
  const configured = getGlobalConfig().flickerFreeMode
  const active = isFullscreenEnvEnabled()
  const configText =
    configured === undefined
      ? 'default (flicker-free)'
      : configured
        ? 'flicker-free'
        : 'classic'
  const override = rendererBlockMessage()
  return [
    `TUI renderer: ${active ? 'flicker-free' : 'classic'}`,
    `Saved setting: ${configText}`,
    override,
  ]
    .filter(Boolean)
    .join('\n')
}

export const call: LocalCommandCall = async args => {
  const mode = (args ? String(args) : '').trim().toLowerCase()

  if (!mode || mode === 'status') {
    return { type: 'text', value: formatStatus() }
  }

  if (
    mode === 'flicker-free' ||
    mode === 'flickerfree' ||
    mode === 'fullscreen' ||
    mode === 'on' ||
    mode === 'no-flicker'
  ) {
    saveGlobalConfig(current => ({
      ...current,
      flickerFreeMode: true,
    }))
    const active = isFullscreenEnvEnabled()
    const override = rendererBlockMessage()
    return {
      type: 'text',
      value: [
        active
          ? 'Flicker-free TUI enabled.'
          : 'Flicker-free TUI saved, but the active renderer is still classic.',
        active
          ? 'The prompt will stay fixed at the bottom while messages scroll above it.'
          : null,
        override,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  if (mode === 'default' || mode === 'classic' || mode === 'off') {
    saveGlobalConfig(current => ({
      ...current,
      flickerFreeMode: false,
    }))
    const active = isFullscreenEnvEnabled()
    const override = rendererBlockMessage()
    return {
      type: 'text',
      value: [
        active
          ? 'Classic renderer saved, but the active renderer is still flicker-free.'
          : 'Classic terminal renderer enabled.',
        active ? null : 'Conversation output will use your terminal scrollback.',
        override,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  return { type: 'text', value: `Unknown renderer: ${mode}\n\n${USAGE}` }
}
