import React from 'react'
import { Box, Text, useInput, useInterval } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { OpenClaudeHeader } from '../components/OpenClaudeHeader.js'
import {
  appendJobInput,
  appendJobModelSwitch,
  appendJobProviderSwitch,
  loadJob,
  readJobLogTail,
  updateJob,
} from './store.js'
import { getPrimaryModel, parseModelList } from '../utils/providerModels.js'
import { getProviderProfiles } from '../utils/providerProfiles.js'

type PickerOption = {
  label: string
  value: string
  description?: string
  providerProfileId?: string
  provider?: string
  model?: string
}

type CommandPicker = {
  kind: 'model' | 'provider'
  title: string
  selected: number
  options: PickerOption[]
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text?: unknown }).text ?? '')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function conversationFromLog(raw: string): Array<{ role: string; text: string }> {
  const turns: Array<{ role: string; text: string }> = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('[context]') || trimmed.startsWith('[agent-view]')) {
      continue
    }
    if (!trimmed.startsWith('{')) continue
    try {
      const event = JSON.parse(trimmed) as {
        type?: string
        result?: string
        isReplay?: boolean
        message?: {
          role?: string
          content?: unknown
        }
      }
      if (event.type === 'control_request' || event.type === 'control_response') {
        continue
      }
      if (event.type === 'user') {
        const text = textFromContent(event.message?.content)
        if (text.includes('<local-command-stdout>') || text.includes('<local-command-stderr>')) {
          continue
        }
        if (text) turns.push({ role: 'You', text })
      } else if (event.type === 'assistant') {
        const text = textFromContent(event.message?.content)
        if (text) turns.push({ role: 'Agent', text })
      } else if (event.type === 'result' && event.result) {
        const last = turns.at(-1)
        if (!last || last.role !== 'Agent' || last.text !== event.result) {
          turns.push({ role: 'Agent', text: event.result })
        }
      }
    } catch {
      // Ignore raw diagnostic lines; the attach view should read like a thread.
    }
  }
  return turns.slice(-8)
}

function uniqueOptions(options: PickerOption[]): PickerOption[] {
  const seen = new Set<string>()
  return options.filter(option => {
    const key = `${option.label}:${option.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildModelOptions(currentModel: string | undefined): PickerOption[] {
  const options: PickerOption[] = []
  if (currentModel) {
    options.push({
      label: currentModel,
      value: currentModel,
      description: 'current thread model',
    })
  }
  options.push({
    label: 'default',
    value: 'default',
    description: 'use the default model for this session',
  })

  for (const profile of getProviderProfiles()) {
    for (const model of parseModelList(profile.model)) {
      options.push({
        label: model,
        value: model,
        description: `${profile.name} · ${profile.provider}`,
      })
    }
  }

  return uniqueOptions(options).slice(0, 12)
}

function buildProviderOptions(): PickerOption[] {
  return getProviderProfiles().map(profile => {
    const model = getPrimaryModel(profile.model)
    return {
      label: profile.name,
      value: profile.id,
      description: `${profile.provider}${model ? ` · ${model}` : ''}`,
      providerProfileId: profile.id,
      provider: profile.provider,
      model,
    }
  })
}

export function AgentAttachPanel({
  id,
  fullscreen = false,
  onBack,
}: {
  id: string
  fullscreen?: boolean
  onBack: () => void
}): React.ReactNode {
  const { rows } = useTerminalSize()
  const [line, setLine] = React.useState('')
  const [output, setOutput] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [picker, setPicker] = React.useState<CommandPicker | null>(null)
  const [localNotices, setLocalNotices] = React.useState<string[]>([])

  const appendSystemOutput = React.useCallback((message: string) => {
    setLocalNotices(current => [...current.slice(-3), message])
  }, [])

  const refresh = React.useCallback(() => {
    void Promise.all([loadJob(id), readJobLogTail(id, 8_000)]).then(([job, tail]) => {
      setStatus(
        job
          ? [
              job.status,
              job.provider,
              job.model,
            ].filter(Boolean).join(' · ')
          : 'missing',
      )
      const turns = conversationFromLog(tail)
      setOutput(
        turns.length > 0
          ? turns.map(turn => `${turn.role}: ${turn.text}`).join('\n\n')
          : 'No conversation output yet.',
      )
    })
  }, [id])

  React.useEffect(refresh, [refresh])
  useInterval(refresh, 1000)

  const switchModel = React.useCallback((nextModel: string) => {
    void appendJobModelSwitch(id, nextModel)
      .then(() => updateJob(id, { model: nextModel, status: 'working' }))
      .then(() => {
        appendSystemOutput(`switched this thread to ${nextModel}.`)
        refresh()
      })
  }, [appendSystemOutput, id, refresh])

  const switchProvider = React.useCallback((option: PickerOption) => {
    if (!option.providerProfileId || !option.provider) {
      appendSystemOutput('provider switching uses saved provider profiles.')
      return
    }
    void appendJobProviderSwitch(id, {
      providerProfileId: option.providerProfileId,
      provider: option.provider,
      model: option.model,
    })
      .then(() => updateJob(id, {
        provider: option.provider,
        model: option.model,
        status: 'working',
      }))
      .then(() => {
        appendSystemOutput(
          `switched this thread to ${option.label}${option.model ? ` (${option.model})` : ''}.`,
        )
        refresh()
      })
  }, [appendSystemOutput, id, refresh])

  useInput((chunk, key, event) => {
    event.stopImmediatePropagation()

    if (picker) {
      if (key.escape || key.leftArrow) {
        setPicker(null)
        return
      }
      if (key.upArrow) {
        setPicker(current => current ? {
          ...current,
          selected: Math.max(0, current.selected - 1),
        } : current)
        return
      }
      if (key.downArrow) {
        setPicker(current => current ? {
          ...current,
          selected: Math.min(current.options.length - 1, current.selected + 1),
        } : current)
        return
      }
      if (key.return) {
        const option = picker.options[picker.selected]
        setPicker(null)
        if (!option) return
        if (picker.kind === 'model') {
          switchModel(option.value)
        } else {
          switchProvider(option)
        }
        return
      }
      return
    }

    if ((key.leftArrow || key.rightArrow || key.escape) && line.length === 0) {
      onBack()
      return
    }
    if (key.escape) {
      setLine('')
      return
    }
    if (key.return) {
      const message = line.trim()
      if (!message) return
      setLine('')
      if (message === '/model') {
        void loadJob(id).then(job => {
          const options = buildModelOptions(job?.model)
          if (options.length === 0) {
            appendSystemOutput('no model options found. Use /model <model-name> to enter one directly.')
            return
          }
          setPicker({
            kind: 'model',
            title: 'Choose thread model',
            selected: 0,
            options,
          })
        })
        return
      }
      if (message.startsWith('/model ')) {
        const nextModel = message.slice('/model '.length).trim()
        if (!nextModel) return
        switchModel(nextModel)
        return
      }
      if (message === '/provider') {
        const options = buildProviderOptions()
        if (options.length === 0) {
          appendSystemOutput('no saved provider profiles found. Add one from the main /provider screen first.')
          return
        }
        setPicker({
          kind: 'provider',
          title: 'Choose thread provider',
          selected: 0,
          options,
        })
        return
      }
      if (message.startsWith('/provider ')) {
        const requested = message.slice('/provider '.length).trim().toLowerCase()
        const option = buildProviderOptions().find(item =>
          item.value.toLowerCase() === requested ||
          item.label.toLowerCase() === requested ||
          item.provider?.toLowerCase() === requested,
        )
        if (!option) {
          appendSystemOutput(`provider profile not found: ${message.slice('/provider '.length).trim()}.`)
          return
        }
        switchProvider(option)
        return
      }
      void appendJobInput(id, message)
        .then(() => updateJob(id, { status: 'working', input_needed: false }))
        .then(() => refresh())
      return
    }
    if (key.backspace || key.delete) {
      setLine(value => value.slice(0, -1))
      return
    }
    if (!key.ctrl && !key.meta && chunk) {
      setLine(value => value + chunk)
    }
  })

  const frameHeight = fullscreen ? Math.max(12, rows - 2) : undefined

  return (
    <Box flexDirection="column" paddingX={fullscreen ? 3 : 2} paddingTop={1} width="100%" height={frameHeight}>
      {fullscreen ? (
        <OpenClaudeHeader title="OpenClaude" statusLine={`Thread ${id} · ${status}`} />
      ) : (
        <Box marginBottom={1} flexDirection="column" flexShrink={0}>
          <Text bold>Thread</Text>
          <Text dimColor>
            {id} · {status}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginBottom={1} flexGrow={1} overflow="hidden">
        <Text>{output.slice(-8_000)}</Text>
        {localNotices.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {localNotices.map((notice, index) => (
              <Text key={`${notice}-${index}`} dimColor>
                System: {notice}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {picker ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>{picker.title}</Text>
            {picker.options.map((option, index) => (
              <Text key={`${option.value}-${index}`} color={index === picker.selected ? 'remember' : undefined}>
                {index === picker.selected ? '› ' : '  '}
                {option.label}
                {option.description ? <Text dimColor> · {option.description}</Text> : null}
              </Text>
            ))}
            <Text dimColor>enter choose · ↑↓ move · esc back</Text>
          </Box>
        ) : null}
        <Box marginTop={1} borderStyle="single" borderColor="inactive" paddingX={1}>
          <Text color="remember">› </Text>
          <Text dimColor={!line}>{line || 'reply to this thread'}</Text>
        </Box>
        <Text dimColor>
          enter send · /model · /provider · ←/esc back · esc clears text
        </Text>
      </Box>
    </Box>
  )
}
