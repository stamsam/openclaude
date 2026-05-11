import type { ToolUseContext } from '../../Tool.js'
import {
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  goalStatus,
} from '../../goal/core.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<{ type: 'text'; value: string }> {
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
      return { type: 'text', value: `Goal resumed: "${goal.objective}"` }
    }
    default: {
      const goal = await setGoal(trimmed)
      return {
        type: 'text',
        value: `Goal set: "${goal.objective}"\nStatus: active\nStart time: ${goal.start_time}\nRun /goal to check progress.`,
      }
    }
  }
}
