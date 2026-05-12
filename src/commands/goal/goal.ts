import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import {
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  goalStatus,
} from './core.js'

const GOAL_AUTOSTART_PROMPT = 'Continue making progress on the active goal.'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  try {
    const trimmed = args.trim()

    if (!trimmed) {
      return { type: 'text', value: await goalStatus() }
    }

    switch (trimmed) {
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
      default: {
        const goal = await setGoal(trimmed)
        return {
          type: 'text',
          value: `Goal set: "${goal.objective}"\nStatus: active\nStart time: ${goal.start_time}\nRun /goal to check progress.`,
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
