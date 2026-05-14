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
import { TerminalMascot } from './TerminalMascot.js'
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
}

function mascotWidth(mascot: TerminalMascot): number {
  const pixelRows = TERMINAL_MASCOT_PIXELS[mascot]
  if (pixelRows) {
    return Math.max(...pixelRows.map(row => row.length)) * 2
  }

  return Math.max(...TERMINAL_MASCOTS[mascot].map(row => row.length))
}

export function OpenClaudeHeader({
  cwd,
  modelLine,
  statusLine,
  title = 'OpenClaude',
}: Props): React.ReactNode {
  const model = useMainLoopModel()
  const effortValue = useAppState(s => s.effortValue)
  const agent = useAppState(s => s.agent)
  const { columns } = useTerminalSize()
  const {
    version,
    cwd: defaultCwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  const displayModel =
    modelLine ?? `${renderModelSetting(model)}${getEffortSuffix(model, effortValue)}`
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
