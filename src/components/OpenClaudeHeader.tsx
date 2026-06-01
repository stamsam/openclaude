import React from 'react'
import { Box, Text } from '../ink.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { getEffortSuffix } from '../utils/effort.js'
import { truncate } from '../utils/format.js'
import {
  getLogoDisplayData,
  truncatePath,
} from '../utils/logoV2Utils.js'
import { renderModelSetting } from '../utils/model/model.js'
import { StatusBar } from './StatusBar.js'
import { useAppState } from '../state/AppState.js'
import { getGlobalConfig } from '../utils/config.js'
import {
  resolveTerminalMascot,
  TERMINAL_MASCOT_PIXELS,
  TERMINAL_MASCOTS,
  type TerminalMascot,
} from '../utils/terminalMascot.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'

type Props = {
  cwd?: string
  modelLine?: string
  statusLine?: string
  title?: string
  compact?: boolean
}

function mascotWidth(mascot: TerminalMascot): number {
  const pixelRows = TERMINAL_MASCOT_PIXELS[mascot]
  if (pixelRows) {
    // Pixel mascots use one terminal cell per pixel (rendered as a half-block
    // glyph), paired top/bottom to form visual rows. width is the max row
    // length in characters. Vertical cells = ceil(rowCount / 2).
    return Math.max(...pixelRows.map(row => row.length))
  }

  return Math.max(...TERMINAL_MASCOTS[mascot].map(row => row.length))
}

export function OpenClaudeHeader({
  cwd,
  modelLine,
  statusLine,
  title = 'OpenClaude',
  compact = false,
}: Props): React.ReactNode {
  const model = useMainLoopModel()
  const effortValue = useAppState(s => s.effortValue)
  const ultracodeActive = useAppState(s => s.ultracodeActive === true)
  const agent = useAppState(s => s.agent)
  const { columns } = useTerminalSize()
  const compactVersion =
    typeof MACRO === 'undefined'
      ? 'dev'
      : MACRO.DISPLAY_VERSION ?? MACRO.VERSION
  if (compact) {
    const textWidth = Math.max(20, columns - 4)
    const displayModel =
      modelLine ?? `${renderModelSetting(model)}${getEffortSuffix(model, effortValue, ultracodeActive)}`
    const displayCwd = truncatePath(cwd ?? process.cwd(), Math.min(54, textWidth))
    const agentName = agent ? agent : undefined
    const safeStatusLine = statusLine ? truncate(statusLine, textWidth) : undefined
    const showStatusInline = Boolean(safeStatusLine && textWidth >= 72)
    const titleWidth = showStatusInline
      ? Math.max(16, textWidth - safeStatusLine!.length - 2)
      : textWidth
    const titleLine = truncate(`${title} v${compactVersion}`, titleWidth)

    return (
      <Box flexDirection="column" flexShrink={0} paddingLeft={1} paddingTop={1} marginBottom={0}>
        <Text>
          <Text bold>{titleLine}</Text>
          {showStatusInline ? <Text dimColor>  {safeStatusLine}</Text> : null}
        </Text>
        {!showStatusInline && safeStatusLine ? <Text dimColor>{safeStatusLine}</Text> : null}
        <StatusBar
          model={displayModel}
          cwd={displayCwd}
          agent={agentName}
          status={safeStatusLine && !showStatusInline ? safeStatusLine : undefined}
          isIdle={!agent}
        />
      </Box>
    )
  }

  const {
    version,
    cwd: defaultCwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  const displayModel =
    modelLine ?? `${renderModelSetting(model)}${getEffortSuffix(model, effortValue, ultracodeActive)}`
  const mascot = resolveTerminalMascot(getGlobalConfig().logoMascot)
  const textWidth = Math.max(20, columns - mascotWidth(mascot) - 6)
  const displayCwd = truncatePath(cwd ?? defaultCwd, Math.min(54, textWidth))
  const agentName = agent ?? agentNameFromSettings
  const secondLine = truncate(
    [displayModel, billingType].filter(Boolean).join(' · '),
    textWidth,
  )
  const thirdLine = truncate(
    agentName ? `@${agentName} · ${displayCwd}` : displayCwd,
    textWidth,
  )
  const safeStatusLine = statusLine ? truncate(statusLine, textWidth) : undefined

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      gap={2}
      paddingLeft={1}
      paddingTop={1}
      marginBottom={1}
    >
      <Box flexShrink={0}>
        <TerminalMascot variant={mascot} />
      </Box>
      <Box flexDirection="column">
        <Text>
          <Text bold>{title}</Text> <Text>v{version}</Text>
        </Text>
        <Text>{secondLine}</Text>
        <Text>{thirdLine}</Text>
        {safeStatusLine ? <Text dimColor>{safeStatusLine}</Text> : null}
      </Box>
    </Box>
  )
}
