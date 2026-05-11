import type { Command } from '../../types/command.js'

const goal: Command = {
  type: 'local',
  name: 'goal',
  description: 'Set and manage a long-running autonomous goal',
  argumentHint: '[<objective> | pause | resume | clear]',
  supportsNonInteractive: true,
  load: () => import('./goal.js'),
}

export default goal
