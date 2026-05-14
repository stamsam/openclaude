import { useMemo } from 'react'
import { getSdkBetas } from '../bootstrap/state.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { Text } from '../ink.js'
import type { Message } from '../types/message.js'
import { resolveContextWindowForModel } from '../utils/context.js'
import { tokenCountWithEstimation } from '../utils/tokens.js'

type Props = {
  messages: readonly Message[]
  model?: string
  providerBaseUrl?: string
  activeProfileProvider?: string
}

export function ContextPercentIndicator({
  messages,
  model,
  providerBaseUrl,
  activeProfileProvider,
}: Props): React.ReactNode {
  const fallbackModel = useMainLoopModel()
  const activeModel = model?.trim() || fallbackModel
  const contextInfo = useMemo(
    () =>
      resolveContextWindowForModel(activeModel, getSdkBetas(), {
        baseUrl: providerBaseUrl,
        activeProfileProvider,
      }),
    [activeModel, activeProfileProvider, providerBaseUrl],
  )
  const tokenUsage = useMemo(() => tokenCountWithEstimation(messages), [messages])

  if (contextInfo.source === 'unknown' || !contextInfo.contextWindow) {
    return <Text dimColor>CTX ?</Text>
  }

  const pct = Math.min(
    100,
    Math.max(0, Math.round((tokenUsage / contextInfo.contextWindow) * 100)),
  )
  const color = pct >= 90 ? 'error' : pct >= 75 ? 'warning' : undefined

  return (
    <Text color={color} dimColor={color === undefined}>
      CTX {pct}%
    </Text>
  )
}
