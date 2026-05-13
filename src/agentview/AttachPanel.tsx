import React from 'react'
import { Box, Text, useInput, useInterval } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { OpenClaudeHeader } from '../components/OpenClaudeHeader.js'
import {
  appendJobInput,
  appendJobModelSwitch,
  loadJob,
  readJobLogTail,
  updateJob,
} from './store.js'

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

function conversationFromLog(raw: string): Array<{ role: string; text: string }> {
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

  const refresh = React.useCallback(() => {
    void Promise.all([loadJob(id), readJobLogTail(id, 8_000)]).then(([job, tail]) => {
      setStatus(job ? `${job.status}${job.model ? ` · ${job.model}` : ''}` : 'missing')
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

  useInput((chunk, key) => {
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
          setOutput(current =>
            `${current}\n\nSystem: current thread model is ${job?.model || 'the inherited default'}. Use /model <model-name> to change only this thread.`,
          )
        })
        return
      }
      if (message.startsWith('/model ')) {
        const nextModel = message.slice('/model '.length).trim()
        if (!nextModel) return
        void appendJobModelSwitch(id, nextModel)
          .then(() => updateJob(id, { model: nextModel, status: 'working' }))
          .then(() => {
            setOutput(current => `${current}\n\nSystem: switched this thread to ${nextModel}.`)
            refresh()
          })
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
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        <Box marginTop={1} borderStyle="single" borderColor="inactive" paddingX={1}>
          <Text color="remember">› </Text>
          <Text dimColor={!line}>{line || 'reply to this thread'}</Text>
        </Box>
        <Text dimColor>
          enter send · /model [name] · ←/esc back · esc clears text
        </Text>
      </Box>
    </Box>
  )
}
