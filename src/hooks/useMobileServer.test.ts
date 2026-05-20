import { describe, expect, test } from 'bun:test'
import { isMobileExitCommand } from './useMobileServer.js'

describe('mobile server command guards', () => {
  test('blocks exit commands with or without slash prefixes', () => {
    for (const command of ['exit', '/exit', 'quit', '/quit', 'q', '/q', ':q', ':qa']) {
      expect(isMobileExitCommand(command)).toBe(true)
    }
    expect(isMobileExitCommand('/dismiss')).toBe(false)
    expect(isMobileExitCommand('/status')).toBe(false)
  })
})
