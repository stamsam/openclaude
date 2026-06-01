import React from 'react'
import { Box, Text } from '../ink.js'
import { Heartbeat } from './Heartbeat.js'
import { truncate } from '../utils/format.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'

type Props = {
  model: string
  effort?: string
  cwd?: string
  agent?: string
  status?: string
  keyhints?: string
  isIdle?: boolean
}

/**
 * Unified status bar — single source of truth for the critical session state.
 * Renders: model · effort · cwd · @agent · status · keyhints
 * Shows a heartbeat dot when idle and no status text is provided.
 * Replaces the ad-hoc lines currently duplicated between OpenClaudeHeader
 * and the REPL's LocalAgentViewHeader / TeammateViewHeader.
 */
export function StatusBar({
  model,
  effort,
  cwd,
  agent,
  status,
  keyhints,
  isIdle = false,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const textWidth = Math.max(40, columns - 4)

  const parts = [
    model,
    effort,
    cwd ? truncate(cwd, 40) : undefined,
    agent ? `@${agent}` : undefined,
    status,
    keyhints,
  ].filter(Boolean)

  const line = parts.join(' · ')

  return (
    <Box flexDirection="row" gap={1} paddingX={1} flexShrink={0}>
      {isIdle && !status ? <Heartbeat /> : null}
      <Text dimColor wrap="truncate">{line}</Text>
    </Box>
  )
}
