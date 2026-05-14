import type { Command } from '../../types/command.js'

const background: Command = {
  type: 'local',
  name: 'background',
  aliases: ['bg'],
  description: 'Start a background OpenClaude session from a prompt',
  argumentHint: '<prompt>',
  supportsNonInteractive: true,
  load: () => import('./background.js'),
}

export default background
