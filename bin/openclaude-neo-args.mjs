const PASSTHROUGH_FIRST_ARGS = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '-V',
  'attach',
  'logs',
  'stop',
  'respawn',
  'rm',
  'bg-runner',
])

export function rewriteOpenClaudeNeoArgv(argv) {
  const args = argv.slice(2)

  if (args[0] === 'agents') {
    return [argv[0], argv[1], 'agents', '--home', ...args.slice(1)]
  }

  if (!args[0] || !PASSTHROUGH_FIRST_ARGS.has(args[0])) {
    return [argv[0], argv[1], 'agents', '--home', ...args]
  }

  return argv
}
