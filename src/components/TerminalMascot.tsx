import React from 'react'
import { Box, RawAnsi, Text } from '../ink.js'
import { ANSI_RESET, ansiBgRgb, ansiRgb } from '../utils/terminalAnsi.js'
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

// Upper half-block: fg color is row A's pixel, bg color is row B's pixel.
// Composite with terminal background — the half-block is a glyph, not a
// background fill, so the user's terminal background shows through any
// unpainted cells. Pairs rows top/bottom so each visual row of pixel art
// uses one terminal row of `▀` glyphs. Final odd row uses `▄` with fg only.
export function TerminalMascot({ variant }: Props): React.ReactNode {
  const mascot = variant ?? resolveTerminalMascot()
  const pixelRows = TERMINAL_MASCOT_PIXELS[mascot]
  if (pixelRows) {
    const width = Math.max(...pixelRows.map(row => row.length))
    const lines: string[] = []
    for (let i = 0; i < pixelRows.length; i += 2) {
      const top = pixelRows[i] ?? ''
      const bot = pixelRows[i + 1] ?? ''
      let line = ''
      for (let x = 0; x < width; x++) {
        const a = TERMINAL_PIXEL_COLORS[top[x] ?? ' ']
        const b = TERMINAL_PIXEL_COLORS[bot[x] ?? ' ']
        if (pixelRows[i + 1] === undefined) {
          // Last odd row — use `▄` (lower half-block) so fg paints the bottom
          // half. The top half stays empty and shows the terminal background.
          line += a ? `${ansiRgb(...a)}▄${ANSI_RESET}` : ' '
        } else if (a && b) {
          line += `${ansiRgb(...a)}${ansiBgRgb(...b)}▀${ANSI_RESET}`
        } else if (a) {
          line += `${ansiRgb(...a)}▀${ANSI_RESET}`
        } else if (b) {
          line += `${ansiBgRgb(...b)}▀${ANSI_RESET}`
        } else {
          line += ' '
        }
      }
      lines.push(line)
    }
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
