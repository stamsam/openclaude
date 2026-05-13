import React from 'react'
import { Box, Text } from '../ink.js'
import {
  resolveTerminalMascot,
  TERMINAL_MASCOTS,
  type TerminalMascot,
} from '../utils/terminalMascot.js'

type Props = {
  variant?: TerminalMascot
}

const COLORS: Record<TerminalMascot, 'claude' | 'inactive' | 'suggestion' | 'success' | 'warning'> = {
  shiba: 'claude',
  crabby: 'claude',
  axo: 'warning',
  moth: 'warning',
  dump: 'inactive',
  cacti: 'success',
  bat: 'inactive',
  toast: 'suggestion',
  shroom: 'claude',
  gorilla: 'inactive',
  shark: 'suggestion',
  ostrich: 'claude',
  snail: 'warning',
  bandit: 'inactive',
  jelly: 'claude',
}

export function TerminalMascot({ variant }: Props): React.ReactNode {
  const mascot = variant ?? resolveTerminalMascot()
  return (
    <Box flexDirection="column">
      {TERMINAL_MASCOTS[mascot].map((line, index) => (
        <Text key={`${mascot}-${index}`} color={COLORS[mascot]}>
          {line}
        </Text>
      ))}
    </Box>
  )
}
