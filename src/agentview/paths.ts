import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export function getAgentViewHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENCLAUDE_AGENTVIEW_HOME || env.OPENCLAUDE_HOME || getClaudeConfigHomeDir()
}

export function getJobsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(getAgentViewHome(env), 'jobs')
}

export function getJobDir(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(getJobsDir(env), id)
}

export function getJobStatePath(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getJobDir(id, env), 'state.json')
}

export function getJobLogPath(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getJobDir(id, env), 'session.log')
}

export function getJobInputPath(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getJobDir(id, env), 'input.ndjson')
}

export function getJobErrorLogPath(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getJobDir(id, env), 'error.log')
}
