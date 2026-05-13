import React from 'react'
import { Box, Text } from '../ink.js'
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
    return (
      <Box flexDirection="column">
        {pixelRows.map((row, rowIndex) => (
          <Box key={`${mascot}-pixel-${rowIndex}`}>
            {Array.from(row).map((cell, colIndex) => {
              const rgb = TERMINAL_PIXEL_COLORS[cell]
              const key = `${mascot}-${rowIndex}-${colIndex}`
              if (!rgb) {
                return <Text key={key}>  </Text>
              }
              return (
                <Text
                  key={key}
                  backgroundColor={`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`}
                >
                  {'  '}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
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
