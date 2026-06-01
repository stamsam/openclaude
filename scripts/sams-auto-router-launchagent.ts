// @ts-nocheck
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const LABEL = 'com.sam.sams-auto-router'
const DEFAULT_PORT = '8001'
const ROUTER_MODEL = 'Sams auto router 4B-35B'
const REPO_ROOT = resolve(import.meta.dir, '..')

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

function plistEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function defaultBunPath(): string {
  if (existsSync(join(homedir(), '.bun', 'bin', 'bun'))) {
    return join(homedir(), '.bun', 'bin', 'bun')
  }
  const found = spawnSync('/usr/bin/env', ['bash', '-lc', 'command -v bun'], { encoding: 'utf8' })
  return found.stdout.trim() || 'bun'
}

function plistPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

function logDir(): string {
  return join(homedir(), 'Library', 'Logs', 'SamsAutoRouter')
}

function routerLogPath(): string {
  return join(homedir(), '.omlx', 'router', 'sams-auto-router.jsonl')
}

function runtimeScriptPath(): string {
  return join(homedir(), '.omlx', 'router', 'sams-auto-router.ts')
}

function writePlist(): string {
  const bunPath = resolve(arg('--bun') ?? defaultBunPath())
  const port = arg('--port') ?? DEFAULT_PORT
  const mode = arg('--mode') ?? 'balanced'
  const host = arg('--host') ?? '127.0.0.1'
  const stdout = join(logDir(), 'stdout.log')
  const stderr = join(logDir(), 'stderr.log')
  const routeLog = expandHome(arg('--log-path') ?? routerLogPath())
  const runtimeScript = runtimeScriptPath()
  const agentPath = plistPath()

  mkdirSync(dirname(agentPath), { recursive: true })
  mkdirSync(logDir(), { recursive: true })
  mkdirSync(dirname(routeLog), { recursive: true })
  mkdirSync(dirname(runtimeScript), { recursive: true })
  copyFileSync(join(REPO_ROOT, 'scripts', 'sams-auto-router.ts'), runtimeScript)

  const programArguments = [
    bunPath,
    runtimeScript,
    '--host',
    host,
    '--port',
    port,
    '--mode',
    mode,
    '--log-path',
    routeLog,
  ]

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${plistEscape(dirname(runtimeScript))}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map(value => `    <string>${plistEscape(value)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistEscape(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(stderr)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${plistEscape(`${dirname(bunPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)}</string>
    <key>SAMS_ROUTER_MODE</key>
    <string>${plistEscape(mode)}</string>
    <key>SAMS_ROUTER_LOG_PATH</key>
    <string>${plistEscape(routeLog)}</string>
  </dict>
</dict>
</plist>
`

  writeFileSync(agentPath, plist)
  return agentPath
}

function launchctl(args: string[]): void {
  const result = spawnSync('launchctl', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n')
    throw new Error(`launchctl ${args.join(' ')} failed${output ? `:\n${output}` : ''}`)
  }
}

function printConfigHint(port = DEFAULT_PORT): void {
  console.log('')
  console.log('Use this provider in OpenClaude / IDEs / CLIs:')
  console.log("  Provider: Sam's Auto Router")
  console.log(`  Base URL: http://127.0.0.1:${port}/v1`)
  console.log('  API Key: local')
  console.log(`  Model: ${ROUTER_MODEL}`)
}

function saveOpenClaudeProfile(port = DEFAULT_PORT): void {
  const profilePath = join(homedir(), '.openclaude-profile.json')
  const profile = {
    profile: 'sams-auto-router',
    env: {
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      OPENAI_API_KEY: 'local',
      OPENAI_MODEL: ROUTER_MODEL,
      OPENAI_API_FORMAT: 'chat_completions',
    },
    createdAt: new Date().toISOString(),
  }
  writeFileSync(profilePath, JSON.stringify(profile, null, 2))
  console.log(`Saved OpenClaude profile: ${profilePath}`)
}

function status(): void {
  const agentPath = plistPath()
  console.log(`LaunchAgent: ${agentPath}`)
  console.log(`Installed: ${existsSync(agentPath) ? 'yes' : 'no'}`)
  const result = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], { encoding: 'utf8' })
  console.log(`Loaded: ${result.status === 0 ? 'yes' : 'no'}`)
  if (result.status === 0) {
    const lines = result.stdout.split('\n').filter(line => /state =|pid =|last exit code =/.test(line))
    for (const line of lines) console.log(line.trim())
  }
}

function install(): void {
  const port = arg('--port') ?? DEFAULT_PORT
  const agentPath = writePlist()
  const domain = `gui/${process.getuid()}`
  spawnSync('launchctl', ['bootout', domain, agentPath], { encoding: 'utf8' })
  launchctl(['bootstrap', domain, agentPath])
  launchctl(['enable', `${domain}/${LABEL}`])
  launchctl(['kickstart', '-k', `${domain}/${LABEL}`])
  if (hasFlag('--openclaude-profile')) {
    saveOpenClaudeProfile(port)
  }
  console.log(`Installed and started ${LABEL}`)
  console.log(`Plist: ${agentPath}`)
  console.log(`Logs: ${logDir()}`)
  console.log(`Route log: ${arg('--log-path') ?? routerLogPath()}`)
  printConfigHint(port)
}

function uninstall(): void {
  const agentPath = plistPath()
  const domain = `gui/${process.getuid()}`
  spawnSync('launchctl', ['bootout', domain, agentPath], { encoding: 'utf8' })
  if (existsSync(agentPath)) rmSync(agentPath)
  console.log(`Uninstalled ${LABEL}`)
}

const command = process.argv[2] ?? 'install'
if (command === 'install') {
  install()
} else if (command === 'uninstall') {
  uninstall()
} else if (command === 'status') {
  status()
} else {
  console.error(`Usage: bun run ${basename(import.meta.path)} [install|uninstall|status] [--port 8001] [--mode balanced] [--log-path <path>] [--openclaude-profile]`)
  process.exit(1)
}
