import React from 'react'
import { Box, Text, useInput, useInterval } from '../ink.js'
import instances from '../ink/instances.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { getTranscriptPath } from '../utils/sessionStorage.js'
import { OpenClaudeHeader } from '../components/OpenClaudeHeader.js'
import { conversationFromLog, findSearchMatchIndex } from './AttachPanel.js'

async function readTranscriptTail(path: string, maxBytes = 100_000): Promise<string> {
  const { stat, open } = await import('fs/promises')
  const info = await stat(path)
  const start = Math.max(0, info.size - maxBytes)
  const length = info.size - start
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, start)
    return buffer.toString('utf8')
  } finally {
    await file.close()
  }
}

export function CurrentSessionPanel({
  fullscreen = false,
  onBack,
}: {
  fullscreen?: boolean
  onBack: () => void
}): React.ReactNode {
  const { rows } = useTerminalSize()
  const [raw, setRaw] = React.useState('')
  const [line, setLine] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [scrollFromBottom, setScrollFromBottom] = React.useState(0)
  const [error, setError] = React.useState('')
  const transcriptPath = getTranscriptPath()

  const refresh = React.useCallback(() => {
    void readTranscriptTail(transcriptPath)
      .then(value => {
        setError('')
        setRaw(value)
      })
      .catch(cause => {
        setRaw('')
        setError(`Unable to read transcript: ${(cause as Error).message}`)
      })
  }, [transcriptPath])

  React.useEffect(refresh, [refresh])
  useInterval(refresh, 1000)

  React.useLayoutEffect(() => {
    if (!fullscreen) return
    instances.get(process.stdout)?.forceRedraw()
  }, [fullscreen, transcriptPath])

  const turns = conversationFromLog(raw)
  const output = turns.length > 0
    ? turns.map(turn => `${turn.role}: ${turn.text}`).join('\n\n')
    : error || 'No current session transcript yet.'
  const outputLines = output.split('\n')
  const viewportRows = Math.max(3, rows - (fullscreen ? 9 : 8))
  const maxScrollFromBottom = Math.max(0, outputLines.length - viewportRows)
  const clampedScrollFromBottom = Math.min(scrollFromBottom, maxScrollFromBottom)
  const visibleStart = Math.max(0, outputLines.length - viewportRows - clampedScrollFromBottom)
  const visibleLines = outputLines.slice(visibleStart, visibleStart + viewportRows)
  const searchMatchIndex = findSearchMatchIndex(outputLines, searchQuery)
  const searchStatus = searchQuery
    ? (searchMatchIndex >= 0 ? `search: "${searchQuery}"` : `search: "${searchQuery}" (0)`)
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
    setScrollFromBottom(Math.max(0, outputLines.length - viewportRows - centeredStart))
  }, [outputLines, searchQuery, viewportRows])

  useInput((chunk, key, event) => {
    event.stopImmediatePropagation()

    if (key.escape && line.length === 0) {
      onBack()
      return
    }
    if (key.escape) {
      setLine('')
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
    if (key.return) {
      const message = line.trim()
      setLine('')
      if (message === '/search') {
        setSearchQuery('')
        return
      }
      if (message.startsWith('/search ')) {
        setSearchQuery(message.slice('/search '.length).trim())
        return
      }
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
        <OpenClaudeHeader title="OpenClaude" statusLine={`Current session · ${transcriptPath}`} />
      ) : (
        <Box marginBottom={1} flexDirection="column" flexShrink={0}>
          <Text bold>Current session</Text>
          <Text dimColor>{transcriptPath}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginBottom={1} flexGrow={1} overflow="hidden">
        <Box flexDirection="column">
          {visibleLines.map((entry, index) => (
            <Text key={`${visibleStart + index}-${entry.slice(0, 16)}`}>
              {entry || ' '}
            </Text>
          ))}
        </Box>
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        <Box marginTop={1} borderStyle="single" borderColor="inactive" paddingX={1}>
          <Text color="remember">› </Text>
          <Text dimColor={!line}>{line || 'type /search <text>'}</Text>
        </Box>
        <Text dimColor>
          enter search · ↑↓ scroll · pgup/pgdn · /search &lt;text&gt; · esc back · {searchStatus}
        </Text>
      </Box>
    </Box>
  )
}
