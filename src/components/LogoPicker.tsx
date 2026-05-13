import * as React from 'react'
import { Box, Text } from '../ink.js'
import { Select } from './CustomSelect/index.js'
import {
  DEFAULT_TERMINAL_MASCOT,
  TERMINAL_MASCOT_COLORS,
  TERMINAL_MASCOT_LABELS,
  TERMINAL_MASCOT_NAMES,
  TERMINAL_MASCOT_PIXELS,
  TERMINAL_MASCOTS,
  TERMINAL_PIXEL_COLORS,
  type TerminalMascot,
} from '../utils/terminalMascot.js'
import { ANSI_RESET, ansiBgRgb, ansiRgb } from '../utils/terminalAnsi.js'

export type LogoPickerProps = {
  initial?: TerminalMascot
  onSelect: (name: TerminalMascot) => void
  onCancel: () => void
}

const PICKER_NOTES: Record<TerminalMascot, string> = {
  shiba: 'orange dog',
  crabby: 'orange block crab',
  axo: 'soft gills',
  moth: 'winged',
  dump: 'round face',
  cacti: 'green sprout',
  bat: 'night wings',
  toast: 'toasty',
  shroom: 'red cap',
  gorilla: 'heavy brow',
  shark: 'blue fin',
  ostrich: 'long stride',
  snail: 'slow shell',
  bandit: 'masked',
  jelly: 'purple jellyfish',
}

function cropPixelRows(rows: readonly string[]): readonly string[] {
  const coloredColumns = rows.flatMap(row =>
    Array.from(row)
      .map((cell, index) => TERMINAL_PIXEL_COLORS[cell] ? index : -1)
      .filter(index => index >= 0),
  )
  const start = Math.max(0, Math.min(...coloredColumns) - 1)
  const end = Math.max(...coloredColumns) + 2
  return rows.map(row => row.slice(start, end))
}

function pixelPreview(pixelRows: readonly string[]): string {
  const rows = cropPixelRows(pixelRows).slice(1, 4)
  return rows
    .map(row =>
      Array.from(row)
        .map(cell => {
          const rgb = TERMINAL_PIXEL_COLORS[cell]
          return rgb ? `${ansiBgRgb(...rgb)}  ${ANSI_RESET}` : '  '
        })
        .join(''),
    )
    .join(' ')
}

function textPreview(name: TerminalMascot): string {
  const [r, g, b] = TERMINAL_MASCOT_COLORS[name]
  return TERMINAL_MASCOTS[name]
    .slice(0, 2)
    .map(line => `${ansiRgb(r, g, b)}${line}${ANSI_RESET}`)
    .join('  ')
}

function previewMascot(name: TerminalMascot): string {
  const pixelRows = TERMINAL_MASCOT_PIXELS[name]
  const [r, g, b] = TERMINAL_MASCOT_COLORS[name]
  const note = `${ansiRgb(r, g, b)}${PICKER_NOTES[name]}${ANSI_RESET}`
  if (pixelRows) {
    return `${pixelPreview(pixelRows)}  ${note}`
  }

  return `${textPreview(name)}  ${note}`
}

export function LogoPicker({
  initial,
  onSelect,
  onCancel,
}: LogoPickerProps): React.ReactElement {
  const options = React.useMemo(
    () =>
      TERMINAL_MASCOT_NAMES.map(name => ({
        label: TERMINAL_MASCOT_LABELS[name],
        description: previewMascot(name),
        dimDescription: false,
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
        hideIndexes
      />
    </Box>
  )
}
