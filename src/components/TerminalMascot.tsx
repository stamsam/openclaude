import React from 'react'
import { Box, RawAnsi, Text } from '../ink.js'
import { ANSI_RESET, ansiBgRgb } from '../utils/terminalAnsi.js'
import {
  TERMINAL_MASCOT_PIXELS,
  resolveTerminalMascot,
  TERMINAL_PIXEL_COLORS,
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
  const pixelRows = TERMINAL_MASCOT_PIXELS[mascot]
  if (pixelRows) {
    const width = Math.max(...pixelRows.map(row => row.length)) * 2
    const lines = pixelRows.map(row =>
      Array.from(row.padEnd(width / 2))
        .map(cell => {
          const rgb = TERMINAL_PIXEL_COLORS[cell]
          return rgb ? `${ansiBgRgb(...rgb)}  ${ANSI_RESET}` : '  '
        })
        .join(''),
    )
    return (
      <RawAnsi
        lines={lines}
        width={width}
      />
    )
  }

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
