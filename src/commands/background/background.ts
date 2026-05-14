import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import {
  formatBackgroundStarted,
  parseDashboardPrompt,
  startBackgroundSession,
} from '../../agentview/cli.js'

export async function call(
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  const prompt = args.trim()
  if (!prompt) {
    return {
      type: 'text',
      value:
        '/bg starts a new background session from a prompt. Usage: /bg --provider groq --model openai/gpt-oss-120b run tests and fix failures. Prefix with @agent-name to route the session to a configured agent. Moving the current live conversation into Agent View is not implemented yet.',
    }
  }

	  const parsed = parseDashboardPrompt(prompt)
	  if (!parsed.prompt) {
	    return {
	      type: 'text',
	      value: 'Add a task after any background flags. Example: /bg --provider groq review this repo',
	    }
	  }
	  const job = await startBackgroundSession({
	    prompt: parsed.prompt,
	    cwd: getOriginalCwd(),
	    provider: parsed.provider,
    model: parsed.model ?? context.options?.mainLoopModel,
    agent: parsed.agent,
    permissionMode: parsed.permissionMode,
  })
  return {
    type: 'text',
    value: formatBackgroundStarted(job),
  }
}
