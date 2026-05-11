import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export function getGoalPaths(env: NodeJS.ProcessEnv = process.env) {
  const home = env.OPENCLAUDE_HOME || getClaudeConfigHomeDir()
  return {
    home,
    stateFile: join(home, 'goal-state.json'),
  }
}
