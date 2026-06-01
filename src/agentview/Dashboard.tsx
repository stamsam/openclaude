import React from 'react'
import { Box, Text, useApp, useInput, useInterval } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { OpenClaudeHeader } from '../components/OpenClaudeHeader.js'
import { useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import {
  createBackgroundJob,
  displayDirectory,
  listJobs,
} from './store.js'
import { launchBackgroundJob } from './runner.js'
import type { AgentViewStatus, BackgroundJob } from './types.js'
import {
  deleteBackgroundSession,
  parseDashboardPrompt,
  respawnBackgroundSession,
} from './cli.js'

const GROUPS: AgentViewStatus[] = [
  'needs_input',
  'working',
  'completed',
  'idle',
  'failed',
  'stopped',
]

type StatusColor =
  | 'warning'
  | 'remember'
  | 'success'
  | 'error'
  | 'inactive'
  | 'secondaryText'

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

function statusColor(status: AgentViewStatus): StatusColor {
  switch (status) {
    case 'needs_input':
      return 'warning'
    case 'working':
      return 'remember'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'idle':
      return 'secondaryText'
    case 'stopped':
      return 'inactive'
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

function shortStatus(status: AgentViewStatus): string {
  switch (status) {
    case 'needs_input':
      return 'input'
    case 'working':
      return 'work'
    case 'completed':
      return 'done'
    case 'idle':
      return 'idle'
    case 'failed':
      return 'fail'
    case 'stopped':
      return 'stop'
  }
}

function sectionTitle(status: AgentViewStatus): string {
  switch (status) {
    case 'needs_input':
      return 'Needs input'
    case 'working':
      return 'Working'
    case 'completed':
      return 'Completed'
    case 'idle':
      return 'Idle'
    case 'failed':
      return 'Failed'
    case 'stopped':
      return 'Stopped'
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

function cell(text: string, width: number): string {
  if (width <= 0) return ''
  return clip(text, width).padEnd(width)
}

function lastOutputLine(job: BackgroundJob): string {
  return (
    job.latest_output_tail?.split('\n').map(line => line.trim()).filter(Boolean).slice(-1)[0] ??
    job.prompt_summary
  )
}

function Row({
  job,
  selected,
  columns,
}: {
  job: BackgroundJob
  selected: boolean
  columns: number
}): React.ReactNode {
  const model =
    job.provider && job.model
      ? `${job.provider}/${job.model}`
      : job.provider ?? job.model ?? 'default'
  const summary = lastOutputLine(job)
  const lineWidth = Math.max(10, Math.min(122, columns - 6))
  const statusWidth = lineWidth >= 58 ? 10 : 0
  const ageWidth = lineWidth >= 42 ? 5 : 0
  const routeWidth = lineWidth >= 76 ? Math.max(10, Math.min(24, Math.floor(lineWidth * 0.18))) : 0
  const titleMinWidth = lineWidth < 24 ? 3 : lineWidth < 30 ? 6 : 10
  const titleMaxWidth = Math.max(titleMinWidth, Math.min(30, lineWidth - 4))
  const titleWidth = Math.min(
    titleMaxWidth,
    Math.max(titleMinWidth, Math.floor(lineWidth * (routeWidth ? 0.26 : 0.34))),
  )
  const fixedWidth = 4 + titleWidth + statusWidth + routeWidth + ageWidth
  const gapWidth = 2 + (statusWidth ? 2 : 0) + (routeWidth ? 2 : 0) + (ageWidth ? 2 : 0)
  const summaryWidth = Math.max(0, lineWidth - fixedWidth - gapWidth)
  return (
    <Box paddingLeft={1}>
      <Box>
        <Text color={selected ? 'remember' : undefined}>
          {selected ? '›' : ' '}
        </Text>
        <Text color={statusColor(job.status)}>{iconFor(job)}</Text>
        <Text color={selected ? 'remember' : undefined}> {cell(job.name, titleWidth)}</Text>
        {statusWidth > 0 ? (
          <Text color={statusColor(job.status)}>  {cell(shortStatus(job.status), statusWidth)}</Text>
        ) : null}
        {summaryWidth > 0 ? <Text dimColor>  {cell(summary, summaryWidth)}</Text> : null}
        {routeWidth > 0 ? <Text color="secondaryText">  {cell(model, routeWidth)}</Text> : null}
        {ageWidth > 0 ? <Text dimColor>  {clip(timeAgo(job.updated_at), ageWidth)}</Text> : null}
      </Box>
    </Box>
  )
}

function StatusStrip({
  jobs,
  columns,
}: {
  jobs: BackgroundJob[]
  columns: number
}): React.ReactNode {
  const width = Math.max(10, columns - 6)
  const visibleStatuses =
    width < 62 ? GROUPS.filter(status => jobs.some(job => job.status === status)) : GROUPS
  if (jobs.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Text color="inactive">0 sessions</Text>
      </Box>
    )
  }
  return (
    <Box paddingLeft={1}>
      {visibleStatuses.map((status, index) => {
        const count = jobs.filter(job => job.status === status).length
        return (
          <React.Fragment key={status}>
            {index > 0 ? <Text dimColor>  </Text> : null}
            <Text color={count > 0 ? statusColor(status) : 'inactive'} bold={count > 0}>
              {statusDot(status)} {shortStatus(status)} {count}
            </Text>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

function SectionHeader({
  status,
  count,
}: {
  status: AgentViewStatus
  count: number
}): React.ReactNode {
  return (
    <Box marginBottom={0} paddingLeft={1}>
      <Text color={statusColor(status)} bold>
        {sectionTitle(status)}
      </Text>
      <Text dimColor> {count}</Text>
    </Box>
  )
}

function SelectedInspector({
  job,
  columns,
}: {
  job?: BackgroundJob
  columns: number
}): React.ReactNode {
  if (!job) return null
  const model =
    job.provider && job.model
      ? `${job.provider}/${job.model}`
      : job.provider ?? job.model ?? 'default'
  const width = Math.max(10, Math.min(122, columns - 6))
  const branch = job.worktree_branch ?? job.branch ?? 'main'
  const mode = job.permission_mode ?? 'default perms'
  const agent = job.agent ? `@${job.agent}` : 'main agent'
  const sourcePath = job.worktree_path ?? job.cwd
  const summary = lastOutputLine(job)
  const metaLine = clip(`${job.id} · ${branch} · ${mode} · ${sectionTitle(job.status)} · updated ${timeAgo(job.updated_at)}`, width)
  const routeLine = clip(`${model} · ${agent} · ${mode} · ${branch}`, width)
  const cwdLine = clip(displayDirectory(sourcePath), width)
  return (
    <Box flexDirection="column" paddingLeft={1} marginTop={1}>
      <Text>
        <Text color="inactive">selected </Text>
        <Text color={statusColor(job.status)}>{metaLine}</Text>
      </Text>
      <Text color="secondaryText">{routeLine}</Text>
      <Text dimColor>{cwdLine}</Text>
      <Text dimColor>{clip(summary, width)}</Text>
    </Box>
  )
}

function EmptyState({
  cwd,
  modelLine,
  columns,
}: {
  cwd: string
  modelLine: string
  columns: number
}): React.ReactNode {
  const width = Math.max(10, Math.min(90, columns - 6))
  return (
    <Box marginY={1} marginLeft={1} flexDirection="column">
      <Text bold>No background sessions</Text>
      <Text dimColor>{clip(`${displayDirectory(cwd)} · ${modelLine}`, width)}</Text>
      <Text />
      <Text color="secondaryText">{clip('Queue a task below and it will show up here when it starts, waits, finishes, or fails.', width)}</Text>
      <Text dimColor>{clip('Try "review this repo" · Try "fix the failing tests" · @Plan sketch a migration', width)}</Text>
    </Box>
  )
}

function HelpPanel(): React.ReactNode {
  return (
    <Box marginLeft={1} flexDirection="column">
      <Text bold>Shortcuts</Text>
      <Text dimColor>up / down      move selection</Text>
      <Text dimColor>enter / right  open selected session</Text>
      <Text dimColor>space          open selected session</Text>
      <Text dimColor>r              respawn selected session</Text>
      <Text dimColor>ctrl+x         delete selected session</Text>
      <Text dimColor>esc / left     close dashboard</Text>
      <Text dimColor>?              toggle this help</Text>
    </Box>
  )
}

function PromptRail({
  input,
  placeholder,
  fullscreen,
  statusLine,
  columns,
}: {
  input: string
  placeholder: string
  fullscreen: boolean
  statusLine: string
  columns: number
}): React.ReactNode {
  const width = Math.max(10, columns - 6)
  const inlineStatus = width >= 72
  const inputWidth = inlineStatus ? Math.max(16, width - statusLine.length - 20) : Math.max(18, width - 8)
  const prompt = (
    <>
      <Text color="secondaryText">task </Text>
      <Text color="remember">› </Text>
      <Text dimColor={!input}>{clip(input || placeholder, inputWidth)}</Text>
      {inlineStatus ? <Text dimColor>  {clip(statusLine, Math.max(12, width - inputWidth - 10))}</Text> : null}
    </>
  )
  if (fullscreen) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="inactive" marginTop={0} />
        <Box paddingX={1}>
          {prompt}
        </Box>
        {!inlineStatus ? (
          <Box paddingLeft={1}>
            <Text dimColor>{clip(statusLine, width)}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }
  return (
    <Box marginTop={0} flexDirection="column">
      <Box borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="inactive" />
      <Box paddingX={1}>
        {prompt}
      </Box>
      {!inlineStatus ? (
        <Box paddingLeft={1}>
          <Text dimColor>{clip(statusLine, width)}</Text>
        </Box>
      ) : null}
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
  const { columns, rows: terminalRows } = useTerminalSize()
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
  const [helpOpen, setHelpOpen] = React.useState(false)
  const lastDeleteAtRef = React.useRef(0)
  useRegisterKeybindingContext('AgentView')

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
  const deleteSelected = React.useCallback((id: string) => {
    const now = Date.now()
    if (now - lastDeleteAtRef.current < 250) return
    lastDeleteAtRef.current = now
    void deleteBackgroundSession(id)
      .then(deleted => {
        setMessage(deleted ? `Deleted ${id}` : `Could not delete ${id}`)
        refresh()
      })
      .catch(error => setMessage(`Failed to delete: ${(error as Error).message}`))
  }, [refresh])

  useKeybinding(
    'agentView:delete',
    () => {
      if (!selected) return false
      deleteSelected(selected.id)
    },
    { context: 'AgentView', isActive: Boolean(selected) && !helpOpen },
  )

  useInput((chunk, key, event) => {
    event.stopImmediatePropagation()

    if (key.escape) {
      if (helpOpen) {
        setHelpOpen(false)
        return
      }
      if (input) {
        setInput('')
        return
      }
      exit()
      return
    }

    if (helpOpen) {
      if (chunk === '?') {
        setHelpOpen(false)
      }
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
      deleteSelected(selected.id)
      return
    }
    if (chunk === '?' && !input) {
      setHelpOpen(value => !value)
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

  const needsInputCount = jobs.filter(job => job.status === 'needs_input').length
  const workingCount = jobs.filter(job => job.status === 'working').length
  const completedCount = jobs.filter(job => job.status === 'completed').length
  const activeCount = needsInputCount + workingCount
  const fullscreenCounts = `${needsInputCount} needs input · ${workingCount} working · ${completedCount} completed`
  const footerStatus = `${activeCount} active · ${needsInputCount} needs input · ${jobs.length} total`
  const shortcutLine = jobs.length === 0
    ? (columns < 70
        ? 'type task · enter start · ?'
        : 'type a task · enter start · ? shortcuts')
    : (columns < 70
        ? '↑↓ move · enter/space open · r · ctrl+x · ?'
        : '↑↓ move · enter/space open · r respawn · ctrl+x delete · ? shortcuts')

  const frameHeight = fullscreen ? Math.max(12, terminalRows) : undefined

  const routeLine = provider && model ? `${provider}/${model}` : provider ?? model ?? 'default model'
  const modelLine = [routeLine, permissionMode].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column" paddingX={fullscreen ? 2 : 2} paddingTop={fullscreen ? 0 : 1} width="100%" height={frameHeight}>
      {fullscreen ? (
        <OpenClaudeHeader
          title="Agent Dashboard"
          cwd={cwd}
          modelLine={modelLine}
          statusLine={fullscreenCounts}
          compact
        />
      ) : (
        <Box marginBottom={0} flexDirection="column" flexShrink={0}>
          <Text bold>Agents</Text>
          <Text dimColor>
            {displayDirectory(cwd)}
            {permissionMode ? ` · ${permissionMode}` : ''}
          </Text>
        </Box>
      )}
      <StatusStrip jobs={jobs} columns={columns} />
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {helpOpen ? <HelpPanel /> : GROUPS.map(status => {
          const groupJobs = jobs.filter(job => job.status === status)
          if (groupJobs.length === 0) return null
          return (
            <Box key={status} flexDirection="column" marginBottom={1}>
              <SectionHeader status={status} count={groupJobs.length} />
              {groupJobs.map(job => (
                <Row
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  columns={columns}
                />
              ))}
            </Box>
          )
        })}
        {!helpOpen && jobs.length === 0 ? (
          <EmptyState cwd={cwd} modelLine={modelLine} columns={columns} />
        ) : null}
      </Box>
      {!helpOpen && jobs.length > 0 ? (
        <SelectedInspector job={selected} columns={columns} />
      ) : null}
      <Box flexDirection="column" flexShrink={0}>
        <PromptRail
          input={input}
          placeholder="start a task in the background"
          fullscreen={fullscreen}
          statusLine={message || footerStatus}
          columns={columns}
        />
        <Text dimColor>{shortcutLine}</Text>
      </Box>
    </Box>
  )
}
