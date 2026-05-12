import { setScheduledTasksEnabled } from '../../bootstrap/state.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  isDurableCronEnabled,
  isKairosCronEnabled,
} from '../../tools/ScheduleCronTool/prompt.js'
import type { LocalCommandResult } from '../../types/command.js'
import { cronToHuman, parseCronExpression } from '../../utils/cron.js'
import {
  addCronTask,
  listAllCronTasks,
  nextCronRunMs,
  removeCronTasks,
} from '../../utils/cronTasks.js'
import { truncate } from '../../utils/format.js'

const HELP = [
  'Cron jobs:',
  '',
  '/cron list',
  '/cron add <M H DoM Mon DoW> -- <prompt>',
  '/cron add <M H DoM Mon DoW> -- <prompt> --once',
  '/cron add <M H DoM Mon DoW> -- <prompt> --durable',
  '/cron delete <id>',
  '',
  'Examples:',
  '/cron add 0 9 * * * -- run the smoke tests',
  '/cron add 30 14 28 2 * -- remind me to check deploy --once',
].join('\n')

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  if (!isKairosCronEnabled()) {
    return {
      type: 'text',
      value:
        'Cron scheduling is disabled by CLAUDE_CODE_DISABLE_CRON or the runtime cron gate.',
    }
  }

  const trimmed = args.trim()
  if (!trimmed || trimmed === 'list') {
    return { type: 'text', value: await formatCronList() }
  }
  if (trimmed === 'help') {
    return { type: 'text', value: HELP }
  }

  const [subcommand, ...rest] = trimmed.split(/\s+/)
  switch (subcommand) {
    case 'add':
      return addCron(rest.join(' '))
    case 'delete':
    case 'remove':
    case 'rm':
      return deleteCron(rest[0])
    default:
      return { type: 'text', value: HELP }
  }
}

async function addCron(args: string): Promise<LocalCommandResult> {
  const delimiter = args.indexOf(' -- ')
  const cron = delimiter >= 0 ? args.slice(0, delimiter).trim() : ''
  const promptAndFlags = delimiter >= 0 ? args.slice(delimiter + 4).trim() : ''
  if (!cron || !promptAndFlags) {
    return { type: 'text', value: `Missing cron expression or prompt.\n\n${HELP}` }
  }
  if (!parseCronExpression(cron)) {
    return {
      type: 'text',
      value: `Invalid cron expression "${cron}". Expected five fields: M H DoM Mon DoW.`,
    }
  }
  const nextRun = nextCronRunMs(cron, Date.now())
  if (nextRun === null) {
    return {
      type: 'text',
      value: `Cron expression "${cron}" does not match any date in the next year.`,
    }
  }

  const once = /\s--once\b|^--once\b/.test(promptAndFlags)
  const durable = /\s--durable\b|^--durable\b/.test(promptAndFlags)
  const effectiveDurable = durable && isDurableCronEnabled()
  const prompt = promptAndFlags
    .replace(/\s--once\b|^--once\b/g, '')
    .replace(/\s--durable\b|^--durable\b/g, '')
    .trim()
  if (!prompt) {
    return { type: 'text', value: `Missing prompt.\n\n${HELP}` }
  }

  const id = await addCronTask(cron, prompt, !once, effectiveDurable)
  setScheduledTasksEnabled(true)
  return {
    type: 'text',
    value: [
      `Scheduled ${once ? 'one-shot' : 'recurring'} job ${id}.`,
      `Schedule: ${cronToHuman(cron)}`,
      `Next run: ${new Date(nextRun).toLocaleString()}`,
      `Storage: ${
        effectiveDurable
          ? 'durable .claude/scheduled_tasks.json'
          : 'session-only'
      }`,
      durable && !effectiveDurable
        ? 'Note: durable cron storage is disabled, so this job was scheduled session-only.'
        : undefined,
      `Prompt: ${prompt}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

async function deleteCron(id: string | undefined): Promise<LocalCommandResult> {
  if (!id) return { type: 'text', value: 'Missing cron job id.' }
  const tasks = await listAllCronTasks()
  const task = tasks.find(item => item.id === id)
  if (!task) return { type: 'text', value: `No scheduled job with id "${id}".` }
  await removeCronTasks([id])
  return { type: 'text', value: `Cancelled cron job ${id}.` }
}

async function formatCronList(): Promise<string> {
  const tasks = await listAllCronTasks()
  if (tasks.length === 0) {
    return `No scheduled cron jobs.\n\n${HELP}`
  }
  return [
    'Scheduled cron jobs:',
    ...tasks.map(task => {
      const nextRun = nextCronRunMs(task.cron, Date.now())
      const storage = task.durable === false ? 'session-only' : 'durable'
      const kind = task.recurring ? 'recurring' : 'one-shot'
      const next = nextRun ? new Date(nextRun).toLocaleString() : 'unknown'
      return `- ${task.id} [${kind}, ${storage}] ${cronToHuman(task.cron)}; next ${next}; ${truncate(task.prompt, 100, true)}`
    }),
  ].join('\n')
}
