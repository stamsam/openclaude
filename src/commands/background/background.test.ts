import { describe, expect, test } from 'bun:test'
import { parseDashboardPrompt } from '../../agentview/cli.js'
import { call } from './background.js'

describe('/bg command', () => {
  test('documents background usage when no prompt is supplied', async () => {
    const result = await call('', {
      options: {
        mainLoopModel: 'sonnet',
      },
    } as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('/bg --provider groq --model')
    expect(result.value).toContain('@agent-name')
  })

  test('rejects flags without task text', async () => {
    const result = await call('--provider groq', {
      options: {
        mainLoopModel: 'sonnet',
      },
    } as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('Add a task after any background flags')
  })
})

describe('Agent View dashboard prompt parsing', () => {
  test('extracts provider and model overrides from a dashboard prompt', () => {
    expect(
      parseDashboardPrompt(
        '--provider groq --model "openai/gpt-oss-120b" review the repo',
      ),
    ).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      prompt: 'review the repo',
    })

    expect(
      parseDashboardPrompt(
        '--provider=groq --model=openai/gpt-oss-120b --permission-mode=plan review',
      ),
    ).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      permissionMode: 'plan',
      prompt: 'review',
    })
  })

  test('extracts agent routes from leading @agent or --agent', () => {
    expect(parseDashboardPrompt('@code-reviewer review the repo')).toEqual({
      agent: 'code-reviewer',
      prompt: 'review the repo',
    })

    expect(parseDashboardPrompt('--agent @planner make a plan')).toEqual({
      agent: 'planner',
      prompt: 'make a plan',
    })
  })
})
