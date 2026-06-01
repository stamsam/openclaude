import React from 'react'
import { Box, Text, useInput, useInterval } from '../ink.js'
import instances from '../ink/instances.js'
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

export type ConversationTurn = { role: string; text: string }

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

export function conversationFromLog(raw: string): ConversationTurn[] {
  const turns: ConversationTurn[] = []
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
  return turns
}

export function mergeConversationTurns(
  logTurns: ConversationTurn[],
  optimisticTurns: ConversationTurn[],
): ConversationTurn[] {
  const pending = optimisticTurns.filter(turn =>
    !logTurns.some(logTurn => logTurn.role === turn.role && logTurn.text === turn.text),
  )
  return [...logTurns, ...pending]
}

export function findSearchMatchIndex(lines: string[], query: string): number {
  const needle = query.trim().toLowerCase()
  if (!needle) return -1
  return lines.findIndex(line => line.toLowerCase().includes(needle))
}

function countSearchMatches(lines: string[], query: string): number {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  return lines.reduce((count, line) => count + (line.toLowerCase().includes(needle) ? 1 : 0), 0)
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
  const [logTurns, setLogTurns] = React.useState<ConversationTurn[]>([])
  const [optimisticTurns, setOptimisticTurns] = React.useState<ConversationTurn[]>([])
  const [status, setStatus] = React.useState('')
  const [picker, setPicker] = React.useState<CommandPicker | null>(null)
  const [localNotices, setLocalNotices] = React.useState<string[]>([])
  const [scrollFromBottom, setScrollFromBottom] = React.useState(0)
  const [searchQuery, setSearchQuery] = React.useState('')

  const appendSystemOutput = React.useCallback((message: string) => {
    setLocalNotices(current => [...current.slice(-3), message])
  }, [])

  const refresh = React.useCallback(() => {
    void Promise.all([loadJob(id), readJobLogTail(id, 100_000)]).then(([job, tail]) => {
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
      setLogTurns(turns)
      setOptimisticTurns(current =>
        current.filter(turn => !turns.some(logTurn => logTurn.role === turn.role && logTurn.text === turn.text)),
      )
    })
  }, [id])

  React.useEffect(refresh, [refresh])
  useInterval(refresh, 1000)

  React.useLayoutEffect(() => {
    if (!fullscreen) return
    instances.get(process.stdout)?.forceRedraw()
  }, [fullscreen, id])

  const outputTurns = mergeConversationTurns(logTurns, optimisticTurns)
  const output = outputTurns.length > 0
    ? outputTurns.map(turn => `${turn.role}: ${turn.text}`).join('\n\n')
    : 'No conversation output yet.'
  const outputLines = output.split('\n')
  const viewportRows = Math.max(3, rows - (fullscreen ? 9 : 8))
  const maxScrollFromBottom = Math.max(0, outputLines.length - viewportRows)
  const clampedScrollFromBottom = Math.min(scrollFromBottom, maxScrollFromBottom)
  const visibleStart = Math.max(0, outputLines.length - viewportRows - clampedScrollFromBottom)
  const visibleLines = outputLines.slice(visibleStart, visibleStart + viewportRows)
  const searchMatchIndex = findSearchMatchIndex(outputLines, searchQuery)
  const searchMatchCount = countSearchMatches(outputLines, searchQuery)
  const scrollStatus = searchQuery
    ? (searchMatchIndex >= 0 ? `search: "${searchQuery}" (${searchMatchCount})` : `search: "${searchQuery}" (0)`)
    : maxScrollFromBottom === 0
      ? 'full thread visible'
      : clampedScrollFromBottom === 0
        ? 'latest'
        : `${clampedScrollFromBottom} lines above latest`

  React.useEffect(() => {
    setScrollFromBottom(value => Math.min(value, maxScrollFromBottom))
  }, [maxScrollFromBottom])

  React.useEffect(() => {
    if (!searchQuery) return
    const matchIndex = findSearchMatchIndex(outputLines, searchQuery)
    if (matchIndex < 0) return
    const centeredStart = Math.max(0, matchIndex - Math.floor(viewportRows / 2))
    const nextScrollFromBottom = Math.max(0, outputLines.length - viewportRows - centeredStart)
    setScrollFromBottom(nextScrollFromBottom)
  }, [outputLines, searchQuery, viewportRows])

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
      if (key.escape) {
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

    if (line.length === 0 && (key.upArrow || key.downArrow || key.pageUp || key.pageDown || key.home || key.end)) {
      const page = Math.max(4, Math.floor(rows * 0.6))
      if (key.upArrow) setScrollFromBottom(value => value + 1)
      else if (key.downArrow) setScrollFromBottom(value => Math.max(0, value - 1))
      else if (key.pageUp) setScrollFromBottom(value => value + page)
      else if (key.pageDown) setScrollFromBottom(value => Math.max(0, value - page))
      else if (key.home) setScrollFromBottom(Number.MAX_SAFE_INTEGER)
      else if (key.end) setScrollFromBottom(0)
      return
    }

    if (key.escape && line.length === 0) {
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
      if (message === '/search') {
        setSearchQuery('')
        setMessage('Search cleared')
        return
      }
      if (message.startsWith('/search ')) {
        const nextQuery = message.slice('/search '.length).trim()
        setSearchQuery(nextQuery)
        if (!nextQuery) {
          setMessage('Search cleared')
          return
        }
        const matchIndex = findSearchMatchIndex(outputLines, nextQuery)
        if (matchIndex < 0) {
          setMessage(`No matches for "${nextQuery}"`)
          return
        }
        const centeredStart = Math.max(0, matchIndex - Math.floor(viewportRows / 2))
        setScrollFromBottom(Math.max(0, outputLines.length - viewportRows - centeredStart))
        setMessage(`Search → "${nextQuery}" (${countSearchMatches(outputLines, nextQuery)})`)
        return
      }
      setOptimisticTurns(current => [...current, { role: 'You', text: message }])
      if (fullscreen) {
        instances.get(process.stdout)?.forceRedraw()
      }
      void appendJobInput(id, message)
        .then(() => updateJob(id, { status: 'working', input_needed: false }))
        .then(() => refresh())
        .catch(error => {
          setOptimisticTurns(current =>
            current.filter(turn => !(turn.role === 'You' && turn.text === message)),
          )
          appendSystemOutput(`failed to send: ${(error as Error).message}`)
        })
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

  const frameHeight = fullscreen ? Math.max(12, rows) : undefined

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
        <Box flexDirection="column">
          {visibleLines.map((line, index) => {
            const absoluteIndex = visibleStart + index
            const isSearchMatch = searchQuery ? line.toLowerCase().includes(searchQuery.trim().toLowerCase()) : false
            return (
              <Text key={`${absoluteIndex}-${line.slice(0, 16)}`} color={isSearchMatch ? 'yellow' : undefined}>
                {line || ' '}
              </Text>
            )
          })}
        </Box>
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
          enter send · ↑↓ scroll · pgup/pgdn · /search &lt;text&gt; · /model · /provider · esc back · {scrollStatus}
        </Text>
      </Box>
    </Box>
  )
}
