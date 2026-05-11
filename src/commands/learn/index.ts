import type { Command } from '../../commands.js'

const learn: Command = {
  type: 'local',
  name: 'learn',
  description: 'Review or apply local OpenClaude learning',
  argumentHint: '[run]',
  supportsNonInteractive: true,
  load: () => import('./learn.js'),
}

export default learn
