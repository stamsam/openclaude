import { describe, expect, test } from 'bun:test'
import { formatExitSummary } from './exitSummary.js'

const stripAnsi = (value: string) => value.replace(/\u001B\[[0-9;]*m/g, '')

describe('formatExitSummary', () => {
  test('renders a boxed shutdown summary with resume command', () => {
    const output = stripAnsi(formatExitSummary({
      sessionId: '5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      resumeCommand:
        'openclaude --resume 5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      wallDurationMs: 20_000,
      apiDurationMs: 5_000,
      toolDurationMs: 3_000,
      toolCallCount: 4,
      toolFailureCount: 1,
      inputTokens: 10_200,
      outputTokens: 1_500,
      cacheReadInputTokens: 2_000,
      cacheCreationInputTokens: 650,
    }, { columns: 80, reason: 'prompt_input_exit' }))

    expect(output).toContain('Agent powering down. Goodbye!')
    expect(output).toContain('Interaction Summary')
    expect(output).toContain('Session ID:')
    expect(output).toContain('Tool Calls:')
    expect(output).toContain('4 ( ✓ 3 × 1 )')
    expect(output).toContain('Success Rate:')
    expect(output).toContain('75.0%')
    expect(output).toContain('Tokens:')
    expect(output).toContain('11,700 total ( 10,200 in · 1,500 out )')
    expect(output).toContain('Cache Tokens:')
    expect(output).toContain('2,000 read · 650 write')
    expect(output).toContain('Performance')
    expect(output).toContain('Agent Active:')
    expect(output).toContain('openclaude --resume')
  })

  test('uses signed out copy for logout', () => {
    const output = stripAnsi(formatExitSummary({
      sessionId: '5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      wallDurationMs: 0,
      apiDurationMs: 0,
      toolDurationMs: 0,
      toolCallCount: 0,
      toolFailureCount: 0,
    }, { columns: 80, reason: 'logout' }))

    expect(output).toContain('Agent signed out. Goodbye!')
    expect(output).toContain('0 ( ✓ 0 × 0 )')
    expect(output).toContain('0.0%')
  })

  test('marks output tokens as estimated when provider usage is unavailable', () => {
    const output = stripAnsi(formatExitSummary({
      sessionId: '5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      wallDurationMs: 0,
      apiDurationMs: 1_000,
      toolDurationMs: 0,
      toolCallCount: 0,
      toolFailureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedOutputTokens: 420,
    }, { columns: 80, reason: 'prompt_input_exit' }))

    expect(output).toContain('~420 total ( 0 in · ~420 out )')
  })

  test('keeps lines within a narrow terminal width', () => {
    const output = stripAnsi(formatExitSummary({
      sessionId: '5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      resumeCommand:
        'openclaude --resume 5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      wallDurationMs: 20_000,
      apiDurationMs: 5_000,
      toolDurationMs: 3_000,
      toolCallCount: 4,
      toolFailureCount: 1,
    }, { columns: 44, reason: 'prompt_input_exit' }))

    for (const line of output.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(42)
    }
  })

  test('clamps inconsistent restored tool counts', () => {
    const output = stripAnsi(formatExitSummary({
      sessionId: '5ad837e5-6b05-4a5b-bc74-4747e6e08f5d',
      wallDurationMs: 0,
      apiDurationMs: 0,
      toolDurationMs: 0,
      toolCallCount: 2,
      toolFailureCount: 5,
    }, { columns: 80, reason: 'prompt_input_exit' }))

    expect(output).toContain('2 ( ✓ 0 × 2 )')
    expect(output).toContain('0.0%')
  })
})
