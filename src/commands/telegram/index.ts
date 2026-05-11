import type { Command } from '../../commands.js'

const telegram = {
  type: 'local-jsx',
  name: 'telegram',
  description: 'Toggle Telegram access for this live session or show setup help',
  argumentHint: '[on|off|status|setup]',
  immediate: true,
  load: () => import('./telegram.js'),
} satisfies Command

export default telegram
