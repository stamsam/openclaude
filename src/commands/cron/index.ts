import type { Command } from '../../types/command.js'
import { isKairosCronEnabled } from '../../tools/ScheduleCronTool/prompt.js'

const cron = {
  type: 'local',
  name: 'cron',
  description: 'List, add, and delete scheduled prompt jobs',
  argumentHint: '[list | add <cron> -- <prompt> [--once] [--durable] | delete <id>]',
  supportsNonInteractive: true,
  isEnabled: isKairosCronEnabled,
  load: () => import('./cron.js'),
} satisfies Command

export default cron
