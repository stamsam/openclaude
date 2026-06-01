import type { ToolUseContext } from '../../Tool.js'
import { reviewLearning, runLearning, addLearnCandidate } from '../../learning/core.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<{ type: 'text'; value: string }> {
  const trimmed = args.trim()

  if (trimmed === 'run') {
    return { type: 'text', value: await runLearning() }
  }

  if (trimmed.length > 0) {
    const sessionId = `cli-direct-${Date.now().toString(36)}`
    const thresholdForMemory = 2
    await addLearnCandidate(sessionId, {
      candidate_type: 'memory',
      confidence: 'high',
      proposed_text: trimmed,
      evidence_summary: 'User-provided learning via /learn',
      target: 'MEMORY.md',
      sensitive: false,
      repeat_count: thresholdForMemory,
    })
    const review = await reviewLearning()
    return {
      type: 'text',
      value: `Queued learning candidate (promotable on next run).\n\n${review}`,
    }
  }

  return { type: 'text', value: await reviewLearning() }
}
