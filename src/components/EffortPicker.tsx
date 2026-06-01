import * as React from 'react'
import { Box, Text } from '../ink.js'
import useInput from '../ink/hooks/use-input.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import type { EffortLevel, EffortValue } from '../utils/effort.js'
import {
  getDisplayedEffortLevel,
  getEffortLevelDescription,
  isOpenAIEffortLevel,
  modelSupportsEffort,
  modelUsesOpenAIEffort,
  openAIEffortToStandard,
} from '../utils/effort.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getReasoningEffortForModel } from '../services/api/providerConfig.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Byline } from './design-system/Byline.js'

type EffortOption = {
  label: string
  value: EffortPickerValue
  description: string
  sublabel?: string
}

export type EffortPickerValue = EffortValue | 'xhigh' | 'ultracode' | undefined

type Props = {
  onSelect: (effort: EffortPickerValue) => void
  onCancel?: () => void
  initialFocus?: EffortPickerValue
}

const OPTIONS: EffortOption[] = [
  {
    label: 'low',
    value: 'low',
    description: 'Fastest response with lightweight reasoning',
  },
  {
    label: 'medium',
    value: 'medium',
    description: 'Balanced speed and reasoning depth',
  },
  {
    label: 'high',
    value: 'high',
    description: 'Deeper reasoning for harder implementation work',
  },
  {
    label: 'xhigh',
    value: 'xhigh',
    description: 'Extra-high reasoning for OpenAI/Codex models',
  },
  {
    label: 'max',
    value: 'max',
    description: getEffortLevelDescription('max'),
  },
  {
    label: 'ultracode',
    value: 'ultracode',
    description: 'xhigh/max effort plus workflow orchestration reminders',
    sublabel: 'xhigh + workflows',
  },
]

function normalizeFocus(value: EffortPickerValue): EffortPickerValue {
  if (value === undefined) return 'medium'
  return value
}

function indexForValue(value: EffortPickerValue): number {
  const normalized = normalizeFocus(value)
  const index = OPTIONS.findIndex(option => option.value === normalized)
  return index >= 0 ? index : 1
}

function getOptionWidth(option: EffortOption): number {
  return option.value === 'ultracode' ? 20 : 12
}

export function EffortPicker({ onSelect, onCancel, initialFocus }: Props) {
  const model = useMainLoopModel()
  const appStateEffort = useAppState((s: any) => s.effortValue)
  const ultracodeActive = useAppState((s: any) => s.ultracodeActive === true)
  const setAppState = useSetAppState()
  const provider = getAPIProvider()
  const usesOpenAIEffort = modelUsesOpenAIEffort(model)
  const currentDisplayedLevel = getDisplayedEffortLevel(model, appStateEffort)

  // For OpenAI/Codex, get the model's default reasoning effort
  const modelReasoningEffort = usesOpenAIEffort ? getReasoningEffortForModel(model) : undefined
  const focusDefault = React.useMemo<EffortPickerValue>(() => {
    if (initialFocus !== undefined) return initialFocus
    if (ultracodeActive) return 'ultracode'
    if (usesOpenAIEffort && appStateEffort === 'max') return 'xhigh'
    if (appStateEffort) return appStateEffort
    return modelReasoningEffort ?? currentDisplayedLevel
  }, [
    appStateEffort,
    currentDisplayedLevel,
    initialFocus,
    modelReasoningEffort,
    ultracodeActive,
    usesOpenAIEffort,
  ])
  const [focusedIndex, setFocusedIndex] = React.useState(() =>
    indexForValue(focusDefault),
  )
  const focusedOption = OPTIONS[focusedIndex] ?? OPTIONS[1]

  function moveFocus(delta: number) {
    setFocusedIndex(index => {
      const next = index + delta
      if (next < 0) return OPTIONS.length - 1
      if (next >= OPTIONS.length) return 0
      return next
    })
  }

  function selectFocused() {
    const value = focusedOption.value
    if (value === 'ultracode') {
      setAppState(prev => ({
        ...prev,
        effortValue: 'max',
        ultracodeActive: true,
      }))
      onSelect('ultracode')
      return
    }

    const effortLevel =
      value === undefined
        ? undefined
        : isOpenAIEffortLevel(String(value))
          ? openAIEffortToStandard(value as 'xhigh')
          : (value as EffortLevel)
    setAppState(prev => ({
      ...prev,
      effortValue: effortLevel,
      ultracodeActive: false,
    }))
    onSelect(value)
  }

  function handleCancel() {
    onCancel?.()
  }

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      moveFocus(-1)
      return
    }
    if (key.rightArrow || input === 'l' || key.tab) {
      moveFocus(1)
      return
    }
    if (key.return) {
      selectFocused()
      return
    }
    if (key.escape) {
      handleCancel()
    }
  })

  const supportsEffort = modelSupportsEffort(model)
  const displayCurrent = ultracodeActive ? 'ultracode' : currentDisplayedLevel

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold={true}>Effort</Text>
        <Text dimColor={true}>
            {supportsEffort && usesOpenAIEffort
              ? `OpenAI/Codex provider (${provider})`
              : supportsEffort
              ? `Claude model · ${provider} provider`
              : `Effort not supported for this model`
          }
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box marginLeft={36}>
          <Text>Faster</Text>
          <Text>{' '.repeat(44)}</Text>
          <Text>Smarter</Text>
        </Box>
        <Box marginLeft={36}>
          <Text dimColor={true}>──────────────────────────────┆──────────────</Text>
        </Box>
        <Box marginLeft={36}>
          {OPTIONS.map((option, index) => (
            <Box key={option.label} width={getOptionWidth(option)}>
              <Text color={index === focusedIndex ? 'inactive' : undefined}>
                {index === focusedIndex ? '▲' : ' '}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginLeft={36}>
          {OPTIONS.map((option, index) => (
            <Box key={option.label} width={getOptionWidth(option)}>
              <EffortRailLabel
                option={option}
                isFocused={index === focusedIndex}
                isCurrent={displayCurrent === option.value}
              />
            </Box>
          ))}
        </Box>
        <Box marginLeft={36}>
          {OPTIONS.map(option => (
            <Box key={option.label} width={getOptionWidth(option)}>
              <Text dimColor={true}>{option.sublabel ?? ''}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1} marginLeft={36}>
          <Text dimColor={true}>{focusedOption.description}</Text>
        </Box>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text dimColor={true} italic={true}>
          <Byline>
            <KeyboardShortcutHint shortcut="←/→" action="choose" />
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        </Text>
      </Box>
    </Box>
  )
}

function EffortRailLabel({
  option,
  isFocused,
  isCurrent,
}: {
  option: EffortOption
  isFocused: boolean
  isCurrent: boolean
}) {
  const isUltracode = option.value === 'ultracode'
  const color = isUltracode
    ? 'purple_FOR_SUBAGENTS_ONLY'
    : isCurrent
      ? 'success'
      : isFocused
        ? 'remember'
        : 'inactive'

  return (
    <>
      <Text color={color} bold={isFocused || isCurrent}>
        {option.label}
      </Text>
    </>
  )
}
