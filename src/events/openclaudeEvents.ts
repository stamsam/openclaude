export type OpenClaudeEvent =
  | {
      type: 'goal.set'
      objective: string
      at: string
    }
  | {
      type: 'goal.pause' | 'goal.resume' | 'goal.complete' | 'goal.clear'
      objective?: string
      at: string
    }
  | {
      type: 'goal.checkpoint'
      objective: string
      label: string
      at: string
    }
  | {
      type: 'goal.tokens'
      objective: string
      tokensUsed: number
      at: string
    }

type OpenClaudeEventHandler = (event: OpenClaudeEvent) => void

const handlers = new Set<OpenClaudeEventHandler>()

export function subscribeOpenClaudeEvents(
  handler: OpenClaudeEventHandler,
): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function emitOpenClaudeEvent(event: OpenClaudeEvent): void {
  for (const handler of handlers) {
    try {
      handler(event)
    } catch {
      // Event handlers must not break the agent path.
    }
  }
}
