import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { fileHistoryMakeSnapshot } from '../../utils/fileHistory.js'
import type { UUID } from 'crypto'
import {
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  goalStatus,
  loadGoal,
  recordGoalCheckpoint,
} from './core.js'

const GOAL_AUTOSTART_PROMPT = 'Continue making progress on the active goal.'
const GOAL_PLAN_PROMPT = `/plan ${GOAL_AUTOSTART_PROMPT}`

function getLatestUserMessageId(context: ToolUseContext): UUID | undefined {
  const userMessage = [...(context.messages ?? [])]
    .reverse()
    .find(message => message.type === 'user')
  return userMessage?.uuid as UUID | undefined
}

function canUseInteractiveGoalCommands(context: ToolUseContext): boolean {
  return context.options?.isNonInteractiveSession !== true
}

export async function call(
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  try {
    const trimmed = args.trim()
    const [subcommand, ...rest] = trimmed.split(/\s+/)

    if (!trimmed) {
      return { type: 'text', value: await goalStatus() }
    }

    switch (subcommand) {
      case 'clear': {
        await clearGoal()
        return { type: 'text', value: 'Goal cleared.' }
      }
      case 'pause': {
        const goal = await pauseGoal()
        if (!goal) return { type: 'text', value: 'No active goal to pause.' }
        return { type: 'text', value: `Goal paused: "${goal.objective}"` }
      }
      case 'resume': {
        const goal = await resumeGoal()
        if (!goal) return { type: 'text', value: 'No paused goal to resume.' }
        return {
          type: 'text',
          value: `Goal resumed: "${goal.objective}"`,
          nextInput: GOAL_AUTOSTART_PROMPT,
          submitNextInput: true,
        }
      }
      case 'plan': {
        const goal = await loadGoal()
        if (!goal || goal.status !== 'active') {
          return { type: 'text', value: 'No active goal to plan.' }
        }
        if (!canUseInteractiveGoalCommands(context)) {
          return {
            type: 'text',
            value:
              'Plan mode is interactive-only in this environment. Continuing with the goal audit prompt instead.',
            nextInput: GOAL_AUTOSTART_PROMPT,
            submitNextInput: true,
          }
        }
        return {
          type: 'text',
          value: `Opening plan mode for goal: "${goal.objective}"`,
          nextInput: GOAL_PLAN_PROMPT,
          submitNextInput: true,
        }
      }
      case 'act': {
        const goal = await loadGoal()
        if (!goal || goal.status !== 'active') {
          return { type: 'text', value: 'No active goal to continue.' }
        }
        return {
          type: 'text',
          value: `Continuing active goal: "${goal.objective}"`,
          nextInput: GOAL_AUTOSTART_PROMPT,
          submitNextInput: true,
        }
      }
      case 'checkpoint': {
        const goal = await loadGoal()
        if (!goal || goal.status !== 'active') {
          return { type: 'text', value: 'No active goal to checkpoint.' }
        }
        const messageId = getLatestUserMessageId(context)
        if (messageId && typeof context.updateFileHistoryState === 'function') {
          await fileHistoryMakeSnapshot(context.updateFileHistoryState, messageId)
        }
        const label = rest.join(' ') || `checkpoint for "${goal.objective}"`
        await recordGoalCheckpoint(label, messageId)
        return {
          type: 'text',
          value: `Goal checkpoint recorded: ${label}\nUse /goal restore to open the existing restore/rewind picker.`,
        }
      }
      case 'restore': {
        if (!canUseInteractiveGoalCommands(context)) {
          return {
            type: 'text',
            value: '/goal restore uses the interactive /rewind picker and is unavailable in non-interactive mode.',
          }
        }
        return {
          type: 'text',
          value: 'Opening existing rewind/restore picker.',
          nextInput: '/rewind',
          submitNextInput: true,
        }
      }
      case 'tasks': {
        if (!canUseInteractiveGoalCommands(context)) {
          return {
            type: 'text',
            value: '/goal tasks uses the interactive /tasks manager and is unavailable in non-interactive mode.',
          }
        }
        return {
          type: 'text',
          value: 'Opening existing background task manager.',
          nextInput: '/tasks',
          submitNextInput: true,
        }
      }
      default: {
        const goal = await setGoal(trimmed)
        return {
          type: 'text',
          value: `Goal set: "${goal.objective}"\nStatus: active\nStart time: ${goal.start_time}\nStarting now.`,
          nextInput: GOAL_AUTOSTART_PROMPT,
          submitNextInput: true,
        }
      }
    }
  } catch (err) {
    return {
      type: 'text',
      value: `Goal error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
