import React from 'react'
import { Box, Text } from '../ink.js'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js'

type Props = {
  agentName: string
  color?: string
  status?: string
  prompt?: string
  hasMessages?: boolean
  diskLoaded?: boolean
}

/**
 * Unified header shown above an agent (local or teammate) transcript.
 * Replaces the two near-duplicate headers (LocalAgentViewHeader inline in
 * REPL.tsx and TeammateViewHeader.tsx) that differed only in color source
 * and keyboard-hint implementation.
 */
export function AgentViewHeader({
  agentName,
  color = 'remember',
  status,
  prompt,
  hasMessages = true,
  diskLoaded = true,
}: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>Viewing </Text>
        <Text color={color} bold>
          @{agentName}
        </Text>
        {status ? <Text dimColor> · {status}</Text> : null}
        <Text dimColor> · </Text>
        <KeyboardShortcutHint shortcut="esc" action="return" />
      </Box>
      {prompt ? <Text dimColor wrap="truncate-end">{prompt}</Text> : null}
      {!hasMessages ? (
        <Text dimColor>
          {diskLoaded ? 'No transcript yet.' : 'Loading agent transcript…'}
        </Text>
      ) : null}
    </Box>
  )
}
