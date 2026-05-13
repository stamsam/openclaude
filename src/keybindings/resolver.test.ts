import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from './defaultBindings.js'
import { parseBindings } from './parser.js'
import { resolveKeyWithChordState } from './resolver.js'
import type { Key } from '../ink.js'

const ctrlXKey: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  wheelUp: false,
  wheelDown: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: true,
  shift: false,
  fn: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
}

describe('keybinding resolver chord precedence', () => {
  test('ctrl+x starts chat chord normally', () => {
    const result = resolveKeyWithChordState(
      'x',
      ctrlXKey,
      ['Chat', 'Global'],
      parseBindings(DEFAULT_BINDINGS),
      null,
    )

    expect(result.type).toBe('chord_started')
  })

  test('agent view ctrl+x deletes instead of entering chat chord mode', () => {
    const result = resolveKeyWithChordState(
      'x',
      ctrlXKey,
      ['AgentView', 'Chat', 'Global'],
      parseBindings(DEFAULT_BINDINGS),
      null,
    )

    expect(result).toEqual({
      type: 'match',
      action: 'agentView:delete',
    })
  })
})
