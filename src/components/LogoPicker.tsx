import * as React from 'react'
import { Box, Text } from '../ink.js'
import { Select } from './CustomSelect/index.js'
import {
  DEFAULT_TERMINAL_MASCOT,
  TERMINAL_MASCOT_LABELS,
  TERMINAL_MASCOT_NAMES,
  TERMINAL_MASCOT_PIXELS,
  TERMINAL_MASCOTS,
  TERMINAL_PIXEL_COLORS,
  type TerminalMascot,
} from '../utils/terminalMascot.js'
import { ANSI_RESET, ansiBgRgb, ansiRgb } from '../utils/terminalAnsi.js'
import { TERMINAL_MASCOT_COLORS } from '../utils/terminalMascot.js'

export type LogoPickerProps = {
  initial?: TerminalMascot
  onSelect: (name: TerminalMascot) => void
  onCancel: () => void
}

function previewMascot(name: TerminalMascot): string {
  const pixelRows = TERMINAL_MASCOT_PIXELS[name]
  if (pixelRows) {
    return pixelRows
      .slice(1, 3)
      .map(row =>
        Array.from(row)
          .map(cell => {
            const rgb = TERMINAL_PIXEL_COLORS[cell]
            return rgb ? `${ansiBgRgb(...rgb)} ${ANSI_RESET}` : ' '
          })
          .join(''),
      )
      .join(' ')
  }

  const [r, g, b] = TERMINAL_MASCOT_COLORS[name]
  return TERMINAL_MASCOTS[name]
    .slice(0, 2)
    .map(line => `${ansiRgb(r, g, b)}${line}${ANSI_RESET}`)
    .join(' ')
}

export function LogoPicker({
  initial,
  onSelect,
  onCancel,
}: LogoPickerProps): React.ReactElement {
  const options = React.useMemo(
    () =>
      TERMINAL_MASCOT_NAMES.map(name => ({
        label: `${previewMascot(name)}  ${TERMINAL_MASCOT_LABELS[name]}`,
        value: name,
      })),
    [],
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Choose the startup mascot</Text>
      <Select
        options={options}
        onChange={value => onSelect(value as TerminalMascot)}
        onCancel={onCancel}
        visibleOptionCount={options.length}
        defaultValue={initial ?? DEFAULT_TERMINAL_MASCOT}
        defaultFocusValue={initial ?? DEFAULT_TERMINAL_MASCOT}
      />
    </Box>
  )
}
