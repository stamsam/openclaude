import type { Command } from '../../commands.js'

const tui = {
  type: 'local',
  name: 'tui',
  description: 'Show or switch the terminal renderer',
  argumentHint: '[flicker-free|classic]',
  supportsNonInteractive: false,
  load: () => import('./tui.js'),
} satisfies Command

export default tui
