import type { ToolUseContext } from '../../Tool.js'
import { reviewLearning, runLearning } from '../../learning/core.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<{ type: 'text'; value: string }> {
  const mode = args.trim() === 'run' ? 'run' : 'preview'
  return {
    type: 'text',
    value: mode === 'run' ? await runLearning() : await reviewLearning(),
  }
}
