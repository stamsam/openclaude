import type { Command } from '../../types/command.js'

const server = {
  type: 'local',
  name: 'server',
  description: 'Start or manage the Sam mobile companion server',
  argumentHint: '[status|stop|tailscale|reset-token]',
  supportsNonInteractive: false,
  load: () => import('./server.js'),
} satisfies Command

export default server
