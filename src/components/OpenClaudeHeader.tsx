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
import { resolveTerminalMascot } from '../utils/terminalMascot.js'

type Props = {
  cwd?: string
  modelLine?: string
  statusLine?: string
  title?: string
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
  const {
    version,
    cwd: defaultCwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  const displayModel =
    modelLine ?? `${renderModelSetting(model)}${getEffortSuffix(model, effortValue)}`
  const displayCwd = truncatePath(cwd ?? defaultCwd, 54)
  const agentName = agent ?? agentNameFromSettings
  const secondLine = truncate(
    [displayModel, billingType].filter(Boolean).join(' · '),
    72,
  )
  const thirdLine = agentName ? `@${agentName} · ${displayCwd}` : displayCwd
  const mascot = resolveTerminalMascot(getGlobalConfig().logoMascot)

  return (
    <Box flexDirection="row" gap={2} paddingLeft={1} paddingTop={1} marginBottom={1}>
      <Box flexShrink={0}>
        <TerminalMascot variant={mascot} />
      </Box>
      <Box flexDirection="column">
        <Text>
          <Text bold>{title}</Text> <Text dimColor>v{version}</Text>
        </Text>
        <Text dimColor>{secondLine}</Text>
        <Text dimColor>{thirdLine}</Text>
        {statusLine ? <Text dimColor>{statusLine}</Text> : null}
      </Box>
    </Box>
  )
}
