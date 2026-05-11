import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export function validateWorkspaceDir(input: string): string {
  const resolved = realpathSync(resolve(input))
  const stats = statSync(resolved)
  if (!stats.isDirectory()) {
    throw new Error(`Workspace is not a directory: ${resolved}`)
  }

  const home = realpathSync(homedir())
  if (resolved === '/' || resolved === home) {
    throw new Error(
      'Workspace must not be "/" or your home directory directly',
    )
  }

  return resolved
}
