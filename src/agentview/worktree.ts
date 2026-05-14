import { execFile } from 'child_process'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type AgentViewWorktree = {
  path: string
  branch: string
}

async function gitOutput(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function prepareAgentViewWorktree(options: {
  id: string
  cwd: string
}): Promise<AgentViewWorktree | undefined> {
  const root = await gitOutput(options.cwd, ['rev-parse', '--show-toplevel'])
  if (!root) return undefined

  const head = await gitOutput(root, ['rev-parse', '--verify', 'HEAD'])
  if (!head) return undefined

  const parent = join(root, '.openclaude', 'worktrees')
  const path = join(parent, options.id)
  const branch = `openclaude-agentview/${options.id}`
  await mkdir(parent, { recursive: true })

  const existing = await gitOutput(root, ['worktree', 'list', '--porcelain'])
  if (existing?.split('\n').some(line => line === `worktree ${path}`)) {
    return { path, branch }
  }

  try {
    await execFileAsync('git', ['worktree', 'add', '-b', branch, path, head], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
    return { path, branch }
  } catch {
    return undefined
  }
}
