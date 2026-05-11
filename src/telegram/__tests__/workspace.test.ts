import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { validateWorkspaceDir } from '../workspace.js'

describe('workspace validation', () => {
  test('accepts a real project directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'oc-telegram-workspace-'))
    const repo = join(root, 'repo')
    mkdirSync(repo)
    expect(validateWorkspaceDir(repo)).toBe(realpathSync(repo))
    rmSync(root, { recursive: true, force: true })
  })

  test('rejects home directory', () => {
    expect(() => validateWorkspaceDir(homedir())).toThrow(
      'Workspace must not be "/" or your home directory directly',
    )
  })
})
