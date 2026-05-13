import React from 'react'
import { Box, Text, useApp, useInput, useInterval } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { OpenClaudeHeader } from '../components/OpenClaudeHeader.js'
import {
  createBackgroundJob,
  displayDirectory,
  labelForStatus,
  listJobs,
} from './store.js'
import { launchBackgroundJob } from './runner.js'
import type { AgentViewStatus, BackgroundJob } from './types.js'
import { parseDashboardPrompt, respawnBackgroundSession } from './cli.js'

const GROUPS: AgentViewStatus[] = [
  'needs_input',
  'working',
  'idle',
  'completed',
  'failed',
  'stopped',
]

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function iconFor(job: BackgroundJob): string {
  switch (job.status) {
    case 'needs_input':
      return '?'
    case 'working':
      return '*'
    case 'idle':
      return '.'
    case 'completed':
      return '+'
    case 'failed':
      return '!'
    case 'stopped':
      return '-'
  }
}

function statusDot(status: AgentViewStatus): string {
  switch (status) {
    case 'needs_input':
      return '?'
    case 'working':
      return '*'
    case 'idle':
      return 'o'
    case 'completed':
      return '+'
    case 'failed':
      return '!'
    case 'stopped':
      return '-'
  }
}

function flatten(jobs: BackgroundJob[]): BackgroundJob[] {
  const byStatus = new Map<AgentViewStatus, BackgroundJob[]>()
  for (const status of GROUPS) byStatus.set(status, [])
  for (const job of jobs) byStatus.get(job.status)?.push(job)
  return GROUPS.flatMap(status => byStatus.get(status) ?? [])
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 1) return text.slice(0, Math.max(0, max))
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function Row({
  job,
  selected,
}: {
  job: BackgroundJob
  selected: boolean
}): React.ReactNode {
  const model = [job.provider, job.model].filter(Boolean).join('/') || 'default model'
  const route = job.agent ? ` @${job.agent}` : ''
  const summary =
    job.latest_output_tail?.split('\n').filter(Boolean).slice(-1)[0] ??
    job.prompt_summary
  const lineWidth = Math.max(32, Math.min(96, (process.stdout.columns ?? 100) - 10))
  const metaWidth = Math.max(28, Math.min(72, lineWidth))
  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      <Box>
        <Text color={selected ? 'remember' : undefined}>
          {selected ? '›' : ' '} {iconFor(job)} {clip(job.name, lineWidth - 8)}
        </Text>
        <Text dimColor>  {timeAgo(job.updated_at)}</Text>
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>{clip(summary, lineWidth)}</Text>
      </Box>
      <Box marginLeft={3}>
        <Text color="secondaryText">
          {clip(`${job.id} · ${displayDirectory(job.cwd)} · ${model}${route}`, metaWidth)}
        </Text>
      </Box>
    </Box>
  )
}

function PromptRail({
  input,
  placeholder,
  fullscreen,
}: {
  input: string
  placeholder: string
  fullscreen: boolean
}): React.ReactNode {
  if (fullscreen) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="inactive" />
        <Box paddingX={1}>
          <Text color="remember">› </Text>
          <Text dimColor={!input}>{input || placeholder}</Text>
        </Box>
        <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="inactive" />
      </Box>
    )
  }
  return (
    <Box marginTop={1} borderStyle="single" borderColor="inactive" paddingX={1}>
      <Text color="remember">› </Text>
      <Text dimColor={!input}>{input || placeholder}</Text>
    </Box>
  )
}

export function AgentViewDashboard({
  cwd,
  provider,
  model,
  permissionMode,
  fullscreen = false,
  onAttach,
  onExit,
}: {
  cwd: string
  provider?: string
  model?: string
  permissionMode?: string
  fullscreen?: boolean
  onAttach: (id: string) => void
  onExit?: () => void
}): React.ReactNode {
  const app = useApp()
  const { rows: terminalRows } = useTerminalSize()
  const exit = React.useCallback(() => {
    if (onExit) {
      onExit()
    } else {
      app.exit()
    }
  }, [app, onExit])
  const [jobs, setJobs] = React.useState<BackgroundJob[]>([])
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [input, setInput] = React.useState('')
  const [message, setMessage] = React.useState('')

  const refresh = React.useCallback(() => {
    void listJobs().then(next => {
      setJobs(next)
      setSelectedIndex(i => Math.min(i, Math.max(0, flatten(next).length - 1)))
    })
  }, [])

  React.useEffect(refresh, [refresh])
  useInterval(refresh, 2000)

  const rows = flatten(jobs)
  const selected = rows[selectedIndex]
  const attachSelected = React.useCallback((id: string) => {
    onAttach(id)
    if (!onExit) {
      app.exit()
    }
  }, [app, onAttach, onExit])

  useInput((chunk, key) => {
    if (key.escape) {
      if (input) {
        setInput('')
        return
      }
      exit()
      return
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(Math.max(0, rows.length - 1), i + 1))
      return
    }
    if ((key.rightArrow || key.return || chunk === ' ') && !input.trim() && selected) {
      attachSelected(selected.id)
      return
    }
    if (key.leftArrow && !input.trim()) {
      exit()
      return
    }
    if (key.ctrl && (chunk === 'x' || chunk === '\x18') && selected) {
      void import('./store.js')
        .then(({ removeJob }) => removeJob(selected.id))
        .then(removed => {
          setMessage(removed ? `Deleted ${selected.id}` : `Stop ${selected.id} before deleting it`)
          refresh()
        })
      return
    }
    if (chunk === 'r' && selected && !input) {
      void respawnBackgroundSession(selected.id)
        .then(job => {
          setMessage(job ? `Respawned ${selected.id} as ${job.id}` : `Unknown session ${selected.id}`)
          refresh()
        })
        .catch(error => setMessage(`Failed to respawn: ${(error as Error).message}`))
      return
    }
    if (key.return && input.trim()) {
      const parsed = parseDashboardPrompt(input.trim())
      const prompt = parsed.prompt
      if (!prompt) {
        setMessage('Enter a prompt after any --provider/--model flags.')
        return
      }
      setInput('')
      void createBackgroundJob({
        prompt,
        cwd,
        provider: parsed.provider ?? provider,
        model: parsed.model ?? model,
        agent: parsed.agent,
        permissionMode: parsed.permissionMode ?? permissionMode,
        useWorktree: true,
      })
        .then(job => launchBackgroundJob(job))
        .then(job => {
          setMessage(`Started ${job.id}`)
          refresh()
        })
        .catch(error => setMessage(`Failed to start: ${(error as Error).message}`))
      return
    }
    if (key.backspace || key.delete) {
      setInput(value => value.slice(0, -1))
      return
    }
    if (!key.ctrl && !key.meta && chunk) {
      setInput(value => value + chunk)
    }
  })

  const counts = GROUPS
    .map(status => [statusDot(status), jobs.filter(j => j.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([dot, count]) => `${dot} ${count}`)
    .join('  ')
  const needsInputCount = jobs.filter(job => job.status === 'needs_input').length
  const workingCount = jobs.filter(job => job.status === 'working').length
  const completedCount = jobs.filter(job => job.status === 'completed').length
  const fullscreenCounts = `${needsInputCount} awaiting input · ${workingCount} working · ${completedCount} completed`

  const frameHeight = fullscreen ? Math.max(12, terminalRows - 2) : undefined

  const modelLine = [provider, model].filter(Boolean).join(' · ') || undefined

  return (
    <Box flexDirection="column" paddingX={fullscreen ? 2 : 2} paddingTop={fullscreen ? 0 : 1} width="100%" height={frameHeight}>
      {fullscreen ? (
        <OpenClaudeHeader
          cwd={cwd}
          modelLine={modelLine}
          statusLine={fullscreenCounts}
        />
      ) : (
        <Box marginBottom={1} flexDirection="column" flexShrink={0}>
          <Text bold>Agents</Text>
          <Text dimColor>
            {displayDirectory(cwd)}
            {counts ? ` · ${counts}` : ''}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {GROUPS.map(status => {
          const groupJobs = jobs.filter(job => job.status === status)
          if (groupJobs.length === 0) return null
          return (
            <Box key={status} flexDirection="column" marginBottom={1}>
              <Text color="secondaryText">{labelForStatus(status)}</Text>
              {groupJobs.map(job => (
                <Row
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                />
              ))}
            </Box>
          )
        })}
        {jobs.length === 0 ? (
          <Box marginY={1} flexDirection="column">
            <Text dimColor>Start a background session and come back when it needs you.</Text>
            <Text dimColor>Examples: "review this repo", "fix tests", "@Plan sketch a migration"</Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {message ? <Text color="success">{message}</Text> : null}
        <PromptRail
          input={input}
          placeholder="describe a task for a new background session"
          fullscreen={fullscreen}
        />
        <Text dimColor>
          enter start · ↑↓ move · space reply · → open · ctrl+x delete · ←/esc back
        </Text>
      </Box>
    </Box>
  )
}
