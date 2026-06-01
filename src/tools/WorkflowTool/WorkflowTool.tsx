import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { AgentTool } from '../AgentTool/AgentTool.js'
import { WORKFLOW_TOOL_NAME } from './constants.js'

const taskSchema = z.strictObject({
  description: z.string().describe('A short 3-5 word description of this workflow step'),
  prompt: z.string().describe('The full task for the agent to perform'),
  subagent_type: z.string().optional().describe('Specialized agent type to use for this step'),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional().describe('Optional model override for this step'),
})

const inputSchema = lazySchema(() =>
  z.strictObject({
    name: z.string().optional().describe('Short workflow name'),
    tasks: z
      .array(taskSchema)
      .min(1)
      .max(3)
      .describe('One to three substantive tasks to launch as background agents'),
    isolation: z
      .enum(['worktree'])
      .optional()
      .describe('Use worktree isolation for each spawned agent'),
    max_parallel: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .describe('Maximum parallel agents. Currently capped at 3.'),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type WorkflowInput = z.infer<InputSchema>
type WorkflowAgent = {
  agentId: string
  description: string
  outputFile?: string
}
type WorkflowOutput = {
  workflow_id: string
  name?: string
  agents: WorkflowAgent[]
}

export const WorkflowTool: Tool<InputSchema, WorkflowOutput> = buildTool({
  name: WORKFLOW_TOOL_NAME,
  searchHint: 'orchestrate substantive work by launching multiple background agents',
  maxResultSizeChars: 20_000,
  async description() {
    return 'Launch a small workflow as background agents'
  },
  async prompt() {
    return `Use this tool to orchestrate substantive tasks by launching multiple background agents.

Ultracode:
- When ultracode is active, use this tool for substantive coding, research, review, or integration work.
- Solo only on conversational/trivial turns or when the user explicitly asks you not to delegate.
- Split work into independent, non-overlapping tasks and cap fanout at three agents.

Quality patterns:
- Give each task a precise prompt, scope, and expected artifact.
- Use worktree isolation when agents may edit overlapping files.
- Do not auto-merge agent work; inspect task output before applying changes.`
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  isEnabled(context) {
    const settings = context?.getAppState?.().settings
    return settings.disableWorkflows !== true
  },
  isConcurrencySafe() {
    return false
  },
  async checkPermissions(input) {
    return {
      behavior: 'ask' as const,
      message: `Launch workflow${input.name ? ` "${input.name}"` : ''} with ${input.tasks.length} background ${input.tasks.length === 1 ? 'agent' : 'agents'}?`,
    }
  },
  async call(
    { name, tasks, isolation }: WorkflowInput,
    toolUseContext,
    canUseTool,
    assistantMessage,
    onProgress,
  ) {
    const workflowId = `workflow_${Date.now().toString(36)}`
    const agents: WorkflowAgent[] = []

    for (const task of tasks.slice(0, 3)) {
      const result = await AgentTool.call(
        {
          description: task.description,
          prompt: task.prompt,
          subagent_type: task.subagent_type,
          model: task.model,
          run_in_background: true,
          isolation,
        },
        toolUseContext,
        canUseTool,
        assistantMessage,
        onProgress,
      )
      const data = result.data as {
        agentId?: string
        description?: string
        outputFile?: string
      }
      if (data.agentId) {
        agents.push({
          agentId: data.agentId,
          description: data.description ?? task.description,
          outputFile: data.outputFile,
        })
      }
    }

    return {
      data: {
        workflow_id: workflowId,
        name,
        agents,
      },
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    const lines = [
      `Workflow launched successfully.`,
      `workflow_id: ${data.workflow_id}`,
      ...(data.name ? [`name: ${data.name}`] : []),
      `agents:`,
      ...data.agents.map(agent =>
        `- agentId: ${agent.agentId}; description: ${agent.description}${agent.outputFile ? `; output_file: ${agent.outputFile}` : ''}`,
      ),
      `Read the output files or wait for task notifications before applying or summarizing agent work.`,
    ]
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, WorkflowOutput>)
