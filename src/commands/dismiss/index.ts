import type { Command } from '../../commands.js'

const dismiss = {
  type: 'local-jsx',
  name: 'dismiss',
  aliases: ['esc', 'cancel'],
  description: 'Dismiss the current local overlay or modal',
  immediate: true,
  load: () => import('./dismiss.js'),
} satisfies Command

export default dismiss
