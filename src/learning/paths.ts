import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export type LearningPaths = {
  home: string
  memoryDir: string
  skillsDir: string
  sessionsDir: string
  queueDir: string
  archiveDir: string
  reportsDir: string
  stateFile: string
}

export function getLearningPaths(env: NodeJS.ProcessEnv = process.env): LearningPaths {
  const home = env.OPENCLAUDE_HOME || getClaudeConfigHomeDir()
  const memoryDir = env.OPENCLAUDE_MEMORY_DIR || join(home, 'memory')
  const skillsDir = env.OPENCLAUDE_SKILLS_DIR || join(home, 'skills')
  const queueDir = join(home, 'learn-queue')
  return {
    home,
    memoryDir,
    skillsDir,
    sessionsDir: join(home, 'sessions'),
    queueDir,
    archiveDir: join(queueDir, '.archive'),
    reportsDir: join(home, 'learn-reports'),
    stateFile: join(home, 'learn-state.json'),
  }
}
