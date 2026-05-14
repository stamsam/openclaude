import { useMemo } from 'react'
import { getSdkBetas } from '../bootstrap/state.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { Text } from '../ink.js'
import type { Message } from '../types/message.js'
import { resolveContextWindowForModel } from '../utils/context.js'
import type { ProviderProfile } from '../utils/config.js'
import { parseModelList } from '../utils/providerModels.js'
import { getActiveProviderProfile } from '../utils/providerProfiles.js'
import { tokenCountWithEstimation } from '../utils/tokens.js'

type Props = {
  messages: readonly Message[]
  model?: string
  providerBaseUrl?: string
  activeProfileProvider?: string
}

function profileMatchesModel(
  profile: ProviderProfile | undefined,
  model: string,
): boolean {
  if (!profile?.model.trim() || !model.trim()) {
    return false
  }

  const normalizedModel = model.trim().toLowerCase()
  return parseModelList(profile.model).some(candidate => {
    const normalizedCandidate = candidate.trim().toLowerCase()
    return (
      normalizedCandidate === normalizedModel ||
      normalizedModel.startsWith(normalizedCandidate)
    )
  })
}

function formatContextPercent(tokenUsage: number, contextWindow: number): string {
  const pct = Math.min(
    100,
    Math.max(0, (tokenUsage / contextWindow) * 100),
  )

  if (pct > 0 && pct < 0.1) {
    return '<0.1'
  }
  if (pct < 10) {
    return pct.toFixed(1).replace(/\.0$/, '')
  }
  return String(Math.round(pct))
}

export function ContextPercentIndicator({
  messages,
  model,
  providerBaseUrl,
  activeProfileProvider,
}: Props): React.ReactNode {
  const fallbackModel = useMainLoopModel()
  const activeModel = model?.trim() || fallbackModel
  const activeProfile = useMemo(() => {
    if (providerBaseUrl || activeProfileProvider) {
      return undefined
    }
    const profile = getActiveProviderProfile()
    return profileMatchesModel(profile, activeModel) ? profile : undefined
  }, [activeModel, activeProfileProvider, providerBaseUrl])
  const contextInfo = useMemo(
    () =>
      resolveContextWindowForModel(activeModel, getSdkBetas(), {
        baseUrl: providerBaseUrl ?? activeProfile?.baseUrl,
        activeProfileProvider: activeProfileProvider ?? activeProfile?.provider,
      }),
    [activeModel, activeProfile, activeProfileProvider, providerBaseUrl],
  )
  const tokenUsage = useMemo(() => tokenCountWithEstimation(messages), [messages])

  if (contextInfo.source === 'unknown' || !contextInfo.contextWindow) {
    return <Text dimColor>CTX ?</Text>
  }

  const pct = (tokenUsage / contextInfo.contextWindow) * 100
  const color = pct >= 90 ? 'error' : pct >= 75 ? 'warning' : undefined
  const pctLabel = formatContextPercent(tokenUsage, contextInfo.contextWindow)

  return (
    <Text color={color} dimColor={color === undefined}>
      CTX {pctLabel}%
    </Text>
  )
}
