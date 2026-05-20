import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '../../../dist/cli.mjs')

export class DangerousBackend {
  spawnSession(
    sessionId: string,
    cwd: string,
    options: {
      model?: string
      provider?: string
      dangerouslySkipPermissions?: boolean
    } = {},
  ): ChildProcess {
    const args = [
      CLI_PATH,
      '--input-format',
      'stream-json',
      '--session-id',
      sessionId,
    ]

    if (options.model) {
      args.push('--model', options.model)
    }
    if (options.provider) {
      args.push('--provider', options.provider)
    }
    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }

    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        CLAUDE_CODE_NO_FLICKER: '1',
        CLAUDE_CODE_AGENT_VIEW: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return child
  }
}
