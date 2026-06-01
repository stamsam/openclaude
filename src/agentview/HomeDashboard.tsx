import React from 'react'
import { Box, Text, useApp, useInput, useInterval } from '../ink.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { useAppState } from '../state/AppState.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { getProviderProfiles } from '../utils/providerProfiles.js'
import { truncate } from '../utils/format.js'
import { truncatePath } from '../utils/logoV2Utils.js'
import { renderModelSetting } from '../utils/model/model.js'
import {
  createBackgroundJob,
  displayDirectory,
  listJobs,
} from './store.js'
import { launchBackgroundJob } from './runner.js'
import type { AgentViewStatus, BackgroundJob, InboxGroup } from './types.js'
import { AgentAttachPanel } from './AttachPanel.js'
import { CurrentSessionPanel } from './CurrentSessionPanel.js'
import {
  deleteBackgroundSession,
  parseDashboardPrompt,
  respawnBackgroundSession,
} from './cli.js'

const INBOX_GROUPS: { key: InboxGroup; label: string; statuses: AgentViewStatus[]; dot: string; color: string }[] = [
  { key: 'needs_decision', label: 'Needs decision', statuses: ['needs_input', 'failed'], dot: '?', color: 'warning' },
  { key: 'running', label: 'Running', statuses: ['working', 'idle'], dot: '*', color: 'remember' },
  { key: 'ready', label: 'Ready', statuses: ['completed'], dot: '+', color: 'success' },
  { key: 'done', label: 'Done', statuses: ['stopped'], dot: '-', color: 'inactive' },
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

function statusColor(status: AgentViewStatus): string {
  switch (status) {
    case 'needs_input': return 'warning'
    case 'working': return 'remember'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'idle': return 'secondaryText'
    case 'stopped': return 'inactive'
  }
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

function inferChangedFiles(job: BackgroundJob): string[] {
  const tail = job.latest_output_tail ?? ''
  for (const line of tail.split('\n')) {
    if (line.includes('Changed files:') || line.includes('Files changed:')) {
      const parts = line.split(':')[1]
      if (parts) return parts.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3)
    }
  }
  return []
}

function inferTestsRun(job: BackgroundJob): string | undefined {
  const tail = job.latest_output_tail ?? ''
  for (const line of tail.split('\n')) {
    const match = line.match(/(\d+)\s*(passed|failed|tests?)/i)
    if (match) return match[0]
  }
  return undefined
}

const STATUS_DOT: Record<string, string> = {
  needs_input: '?', failed: '!', working: '*', idle: 'o', completed: '+', stopped: '-',
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
  const model = job.provider && job.model ? `${job.provider}/${job.model}` : job.provider ?? job.model ?? ''
  const summary = lastOutputLine(job)
  const lineWidth = Math.max(10, Math.min(122, columns - 6))
  const nameWidth = Math.min(22, Math.max(8, Math.floor(lineWidth * 0.2)))
  const routeWidth = lineWidth >= 72 ? Math.min(18, Math.floor(lineWidth * 0.15)) : 0
  const ageWidth = lineWidth >= 48 ? 5 : 0
  const decisionWidth = lineWidth >= 60 ? Math.min(10, Math.floor(lineWidth * 0.1)) : 0
  const needsDecision = job.status === 'needs_input' || job.status === 'failed'

  const fixedWidth = 2 + nameWidth + (routeWidth ? routeWidth + 2 : 0) + (ageWidth ? ageWidth + 2 : 0) + (decisionWidth ? decisionWidth + 2 : 0)
  const summaryWidth = Math.max(0, lineWidth - fixedWidth - 4)

  const changedFiles = inferChangedFiles(job)
  const testsRun = inferTestsRun(job)
  const showDetails = lineWidth >= 60 && (summary !== job.prompt_summary || changedFiles.length > 0 || testsRun)

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box>
        <Text color={selected ? 'remember' : undefined}>
          {selected ? '›' : ' '}
        </Text>
        <Text color={statusColor(job.status)}>{STATUS_DOT[job.status] ?? '-'}</Text>
        <Text color={selected ? 'remember' : undefined} bold={needsDecision}> {cell(job.name, nameWidth)}</Text>
        {summaryWidth > 0 ? <Text dimColor>  {cell(showDetails ? clip(summary, summaryWidth - 4) : summary, summaryWidth)}</Text> : null}
        {routeWidth > 0 ? <Text color="secondaryText">  {cell(model, routeWidth)}</Text> : null}
        {decisionWidth > 0 && needsDecision ? <Text color="warning">  DECIDE</Text> : decisionWidth > 0 && job.status === 'completed' ? <Text color="success">  READY</Text> : null}
        {ageWidth > 0 ? <Text dimColor>  {clip(timeAgo(job.updated_at), ageWidth)}</Text> : null}
      </Box>
      {showDetails ? (
        <Box paddingLeft={2}>
          <Text dimColor>{clip(summary, Math.max(10, lineWidth - 22))}</Text>
          {changedFiles.length > 0 ? <Text color="secondaryText">  {changedFiles.map(f => clip(f, 24)).join(', ')}</Text> : null}
          {testsRun ? <Text color="success">  {testsRun}</Text> : null}
        </Box>
      ) : null}
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
  if (jobs.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Text color="inactive">0 background agents</Text>
      </Box>
    )
  }
  const width = Math.max(10, columns - 6)
  const visibleGroups = width < 62
    ? INBOX_GROUPS.filter(g => jobs.some(job => g.statuses.includes(job.status)))
    : INBOX_GROUPS
  return (
    <Box paddingLeft={1}>
      {visibleGroups.map((group, index) => {
        const count = jobs.filter(job => group.statuses.includes(job.status)).length
        return (
          <React.Fragment key={group.key}>
            {index > 0 ? <Text dimColor>  </Text> : null}
            <Text color={count > 0 ? group.color as any : 'inactive'} bold={count > 0}>
              {group.dot} {group.label === 'Needs decision' ? 'need' : group.label.toLowerCase()} {count}
            </Text>
          </React.Fragment>
        )
      })}
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
      <Text bold>No background agents</Text>
      <Text dimColor>{clip(`${displayDirectory(cwd)} · ${modelLine}`, width)}</Text>
      <Text />
      <Text color="secondaryText">{clip('Queue a task below — background agents run independently so you can keep chatting.', width)}</Text>
      <Text dimColor>{clip('Type a prompt · /model <name> · /provider <name> · /providers', width)}</Text>
    </Box>
  )
}

function HelpPanel(): React.ReactNode {
  return (
    <Box marginLeft={1} flexDirection="column">
      <Text bold>Shortcuts</Text>
      <Text dimColor>↑ ↓       move selection</Text>
      <Text dimColor>enter     open selected thread / current session</Text>
      <Text dimColor>space     open selected agent thread</Text>
      <Text dimColor>esc       clear input / close help</Text>
      <Text dimColor>q         exit dashboard</Text>
      <Text dimColor>/model &lt;name&gt;    override default model</Text>
      <Text dimColor>/provider &lt;name&gt; override default provider</Text>
      <Text dimColor>/providers         list configured providers</Text>
      <Text dimColor>ctrl+n    new background agent</Text>
      <Text dimColor>r         respawn</Text>
      <Text dimColor>ctrl+x    delete</Text>
      <Text dimColor>?         toggle help</Text>
    </Box>
  )
}

export function formatProviderProfilesSummary(
  profiles: Array<{ id: string; name?: string; provider: string; model: string; baseUrl?: string }>,
): string[] {
  return profiles.map(profile =>
    `${profile.name || profile.id}: ${profile.provider}/${profile.model}${profile.baseUrl ? ` @ ${profile.baseUrl}` : ''}`,
  )
}

function PromptBar({
  input,
  fullscreen,
  statusLine,
  columns,
}: {
  input: string
  fullscreen: boolean
  statusLine: string
  columns: number
}): React.ReactNode {
  const width = Math.max(10, columns - 6)
  const inlineStatus = width >= 72
  const inputWidth = inlineStatus ? Math.max(16, width - statusLine.length - 16) : Math.max(18, width - 8)

  const prompt = (
    <>
      <Text color="secondaryText">task</Text>
      <Text color="remember"> › </Text>
      <Text dimColor={!input}>{clip(input || 'start a background task', inputWidth)}</Text>
      {inlineStatus ? <Text dimColor>  {clip(statusLine, Math.max(12, width - inputWidth - 10))}</Text> : null}
    </>
  )

  return (
    <Box flexDirection="column">
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

export function HomeDashboard({
  cwd,
  provider,
  model,
  permissionMode,
  fullscreen = false,
  onExit,
}: {
  cwd: string
  provider?: string
  model?: string
  permissionMode?: string
  fullscreen?: boolean
  onExit?: () => void
}): React.ReactNode {
  const app = useApp()
  const { columns, rows: terminalRows } = useTerminalSize()
  const exit = React.useCallback(() => {
    if (onExit) onExit()
    else app.exit()
  }, [app, onExit])

  const [jobs, setJobs] = React.useState<BackgroundJob[]>([])
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [input, setInput] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [viewingThread, setViewingThread] = React.useState<{ kind: 'current' } | { kind: 'job'; id: string } | null>(null)
  const [activeProvider, setActiveProvider] = React.useState(provider)
  const [activeModel, setActiveModel] = React.useState(model)
  const lastDeleteAtRef = React.useRef(0)

  const refresh = React.useCallback(() => {
    void listJobs().then(next => {
      setJobs(next)
      const total = next.length + 1
      setSelectedIndex(i => Math.min(i, Math.max(0, total - 1)))
    })
  }, [])

  React.useEffect(refresh, [refresh])
  useInterval(refresh, 2000)

  const visibleRows: ('session' | BackgroundJob)[] = [
    'session',
    ...INBOX_GROUPS.flatMap(group => jobs.filter(job => group.statuses.includes(job.status))),
  ]
  const totalRows = visibleRows.length
  const selected = visibleRows[selectedIndex]

  const attachSelected = React.useCallback((id: string) => {
    if (!id) {
      setMessage('Cannot open thread: missing session id.')
      return
    }
    setViewingThread({ kind: 'job', id })
  }, [])

  const deleteSelected = React.useCallback((id: string) => {
    if (!id) {
      setMessage('Cannot delete session: missing session id.')
      return
    }
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

  useInput((chunk, key) => {
    if (viewingThread) return

    if (key.escape) {
      if (helpOpen) { setHelpOpen(false); return }
      if (input) { setInput(''); return }
      setMessage('Press q to exit. Enter opens the selected thread.')
      return
    }

    if (helpOpen) {
      if (chunk === '?') setHelpOpen(false)
      return
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min(Math.max(0, totalRows - 1), i + 1))
      return
    }

    if (key.return && !input.trim()) {
      if (selected === 'session') {
        setViewingThread({ kind: 'current' })
        return
      }
      if (selected) {
        attachSelected((selected as BackgroundJob).id)
        return
      }
    }

    if (key.return && input.trim()) {
      const text = input.trim()

      const modelMatch = text.match(/^\/model\s+(.+)$/)
      if (modelMatch) {
        setActiveModel(modelMatch[1])
        setInput('')
        setMessage(`Model → ${modelMatch[1]}`)
        return
      }
      const providerMatch = text.match(/^\/provider\s+(.+)$/)
      if (providerMatch) {
        setActiveProvider(providerMatch[1])
        setInput('')
        setMessage(`Provider → ${providerMatch[1]}`)
        return
      }
      if (text === '/providers') {
        setInput('')
        const profiles = getProviderProfiles()
        if (profiles.length === 0) {
          setMessage('No provider profiles configured.')
          return
        }
        setMessage(formatProviderProfilesSummary(profiles).join(' · '))
        return
      }

      const parsed = parseDashboardPrompt(text)
      const prompt = parsed.prompt
      if (!prompt) {
        setMessage('Enter a prompt after any --provider/--model flags.')
        return
      }
      setInput('')
      void createBackgroundJob({
        prompt, cwd,
        provider: parsed.provider ?? activeProvider,
        model: parsed.model ?? activeModel,
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

    if ((chunk === ' ' || key.rightArrow) && !input.trim() && selected && selected !== 'session') {
      attachSelected(selected.id)
      return
    }

    if (chunk === '?' && !input) {
      setHelpOpen(v => !v)
      return
    }

    if (chunk === 'q' && !input) {
      exit()
      return
    }

    if (key.ctrl && chunk === 'n') {
      setMessage('Type a task and press enter to start a background agent')
      return
    }

    if (chunk === 'r' && selected && selected !== 'session' && !input) {
      void respawnBackgroundSession(selected.id)
        .then(job => {
          setMessage(job ? `Respawned ${selected.id} as ${job.id}` : `Unknown session ${selected.id}`)
          refresh()
        })
        .catch(error => setMessage(`Failed to respawn: ${(error as Error).message}`))
      return
    }

    if (key.ctrl && (chunk === 'x' || chunk === '\x18') && selected && selected !== 'session') {
      deleteSelected((selected as BackgroundJob).id)
      return
    }

    if (key.backspace || key.delete) {
      setInput(v => v.slice(0, -1))
      return
    }

    if (!key.ctrl && !key.meta && chunk) {
      setInput(v => v + chunk)
    }
  })

  const decisionCount = jobs.filter(j => j.status === 'needs_input' || j.status === 'failed').length
  const workingCount = jobs.filter(j => j.status === 'working').length
  const readyCount = jobs.filter(j => j.status === 'completed').length
  const activeCount = decisionCount + workingCount
  const statusLine = `${activeCount} active · ${decisionCount} need decision · ${jobs.length} total`

  const shortcutLine = jobs.length === 0
    ? 'enter: view current session · q: exit · ctrl+n: new agent · ?: help'
    : '↑↓ select · enter/space: view thread · q: exit · ctrl+n: new · r: respawn · ?: help'

  const frameHeight = fullscreen ? Math.max(12, terminalRows) : undefined
  const routeLine = provider && model ? `${provider}/${model}` : provider ?? model ?? 'default model'
  const modelLine = [routeLine, permissionMode].filter(Boolean).join(' · ')

  const displayModel = renderModelSetting(useMainLoopModel())
  const agentName = useAppState(s => s.agent)

  return viewingThread ? (
    viewingThread.kind === 'current'
      ? <CurrentSessionPanel fullscreen={fullscreen} onBack={() => setViewingThread(null)} />
      : <AgentAttachPanel id={viewingThread.id} fullscreen={fullscreen} onBack={() => setViewingThread(null)} />
  ) : (
    <Box flexDirection="column" paddingX={fullscreen ? 2 : 2} paddingTop={fullscreen ? 0 : 1} width="100%" height={frameHeight}>
      {fullscreen ? (() => {
        const textWidth = Math.max(20, columns - 16)
        const displayCwd = truncatePath(cwd ?? process.cwd(), Math.min(54, textWidth))
        const detailLine = truncate([displayModel, agentName ? `@${agentName}` : undefined, displayCwd].filter(Boolean).join(' · '), textWidth)
        const statusText = `${decisionCount} need decision · ${workingCount} working · ${readyCount} ready`
        return (
          <Box flexDirection="row" flexShrink={0} gap={1} paddingLeft={1} paddingTop={1} marginBottom={1}>
            <Text color="secondaryText">🐙</Text>
            <Box flexDirection="column">
              <Text>
                <Text bold>Home</Text> <Text>v1</Text>
              </Text>
              <Text dimColor>{detailLine}</Text>
              {statusText ? <Text dimColor>{truncate(statusText, textWidth)}</Text> : null}
              {activeProvider !== provider || activeModel !== model ? (
                <Text color="yellow" dimColor> model: {[activeProvider, activeModel].filter(Boolean).join('/') || 'default model'}</Text>
              ) : null}
            </Box>
          </Box>
        )
      })() : (
        <Box marginBottom={0} flexDirection="column" flexShrink={0}>
          <Text bold>Home</Text>
          <Text dimColor>{displayDirectory(cwd)}{permissionMode ? ` · ${permissionMode}` : ''}</Text>
          {activeProvider !== provider || activeModel !== model ? <Text color="yellow"> /model: {[activeProvider, activeModel].filter(Boolean).join('/') || 'default model'}</Text> : null}
        </Box>
      )}
      <StatusStrip jobs={jobs} columns={columns} />
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Box paddingLeft={1}>
          <Text color={selected === 'session' ? 'remember' : undefined}>
            {selected === 'session' ? '›' : ' '}<Text color="remember">●</Text>
          </Text>
          <Text bold color={selected === 'session' ? 'remember' : undefined}> Current session</Text>
        </Box>
        {helpOpen ? <HelpPanel /> : INBOX_GROUPS.map(group => {
          const groupJobs = jobs.filter(job => group.statuses.includes(job.status))
          if (groupJobs.length === 0) return null
          return (
            <Box key={group.key} flexDirection="column" marginBottom={1}>
              <Box marginBottom={0} paddingLeft={1}>
                <Text color={group.color as any} bold>{group.label}</Text>
                <Text dimColor> {groupJobs.length}</Text>
              </Box>
              {groupJobs.map(job => (
                <Row key={job.id} job={job} selected={selected !== 'session' && selected?.id === job.id} columns={columns} />
              ))}
            </Box>
          )
        })}
        {!helpOpen && jobs.length === 0 ? <EmptyState cwd={cwd} modelLine={modelLine} columns={columns} /> : null}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        <PromptBar input={input} fullscreen={fullscreen} statusLine={message || statusLine} columns={columns} />
        <Text dimColor>{shortcutLine}</Text>
      </Box>
    </Box>
  )
}
