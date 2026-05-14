import type { Command } from '../../commands.js'
import {
  DEFAULT_TERMINAL_MASCOT,
  TERMINAL_MASCOT_LABELS,
  isTerminalMascot,
} from '../../utils/terminalMascot.js'
import { getGlobalConfig } from '../../utils/config.js'

const logo = {
  type: 'local-jsx',
  name: 'logo',
  get description(): string {
    const current = getGlobalConfig().logoMascot
    const shown = isTerminalMascot(current) ? current : DEFAULT_TERMINAL_MASCOT
    return `Change the startup mascot (current: ${TERMINAL_MASCOT_LABELS[shown]})`
  },
  isHidden: false,
  load: () => import('./logo.js'),
} satisfies Command

export default logo
