import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import React from 'react'
import stripAnsi from 'strip-ansi'

import { createRoot } from '../ink.js'
import { AppStateProvider } from '../state/AppState.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import {
  getTerminalMascotRows,
  TERMINAL_MASCOT_NAMES,
} from '../utils/terminalMascot.js'
import { AgentViewDashboard } from './Dashboard.js'
import { createBackgroundJob, updateJob } from './store.js'

const SYNC_START = '\x1B[?2026h'
const SYNC_END = '\x1B[?2026l'

const ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME = process.env.OPENCLAUDE_AGENTVIEW_HOME
const ORIGINAL_OPENCLAUDE_MASCOT = process.env.OPENCLAUDE_MASCOT
const ORIGINAL_MACRO = (globalThis as Record<string, unknown>).MACRO

let home: string

function extractLastFrame(output: string): string {
  let lastFrame: string | null = null
  let cursor = 0

  while (cursor < output.length) {
    const start = output.indexOf(SYNC_START, cursor)
    if (start === -1) break

    const contentStart = start + SYNC_START.length
    const end = output.indexOf(SYNC_END, contentStart)
    if (end === -1) break

    const frame = output.slice(contentStart, end)
    if (frame.trim().length > 0) {
      lastFrame = frame
    }
    cursor = end + SYNC_END.length
  }

  return lastFrame ?? output
}

function createTestStreams(): {
  stdout: PassThrough
  stdin: PassThrough & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    ref: () => void
    unref: () => void
  }
  getOutput: () => string
} {
  let output = ''
  const stdout = new PassThrough()
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    ref: () => void
    unref: () => void
  }

  stdin.isTTY = true
  stdin.setRawMode = () => {}
  stdin.ref = () => {}
  stdin.unref = () => {}
  ;(stdout as unknown as { columns: number; rows: number }).columns = 120
  ;(stdout as unknown as { columns: number; rows: number }).rows = 32
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  return {
    stdout,
    stdin,
    getOutput: () => output,
  }
}

async function waitForOutput(
  getOutput: () => string,
  predicate: (output: string) => boolean,
): Promise<string> {
  const startedAt = Date.now()
  let lastOutput = ''

  while (Date.now() - startedAt < 2500) {
    const output = stripAnsi(extractLastFrame(getOutput()))
    lastOutput = output
    if (predicate(output)) return output
    await Bun.sleep(10)
  }

  throw new Error(`Timed out waiting for Agent View dashboard output:\n${lastOutput}`)
}

async function renderDashboardFrame({
  fullscreen = false,
  predicate,
}: {
  fullscreen?: boolean
  predicate: (output: string) => boolean
}): Promise<string> {
  const { stdout, stdin, getOutput } = createTestStreams()
  const root = await createRoot({
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
  })

  root.render(
    <AppStateProvider>
      <KeybindingSetup>
        <AgentViewDashboard
          cwd={home}
          provider="oMLX"
          model="local-router"
          permissionMode="acceptEdits"
          fullscreen={fullscreen}
          onAttach={() => {}}
          onExit={() => {}}
        />
      </KeybindingSetup>
    </AppStateProvider>,
  )

  try {
    return await waitForOutput(getOutput, predicate)
  } finally {
    root.unmount()
    stdin.end()
    stdout.end()
    await Bun.sleep(0)
  }
}

describe.serial('AgentViewDashboard rendering', () => {
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'openclaude-agent-dashboard-'))
    process.env.OPENCLAUDE_AGENTVIEW_HOME = home
    process.env.OPENCLAUDE_MASCOT = 'shiba'
    ;(globalThis as Record<string, unknown>).MACRO = {
      VERSION: 'test-version',
      DISPLAY_VERSION: 'test-version',
      BUILD_TIME: '',
      ISSUES_EXPLAINER: 'open an issue',
      FEEDBACK_CHANNEL: '#feedback',
      PACKAGE_URL: 'openclaude-private',
      NATIVE_PACKAGE_URL: undefined,
    }
  })

  afterEach(async () => {
    if (ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME === undefined) {
      delete process.env.OPENCLAUDE_AGENTVIEW_HOME
    } else {
      process.env.OPENCLAUDE_AGENTVIEW_HOME = ORIGINAL_OPENCLAUDE_AGENTVIEW_HOME
    }
    if (ORIGINAL_OPENCLAUDE_MASCOT === undefined) {
      delete process.env.OPENCLAUDE_MASCOT
    } else {
      process.env.OPENCLAUDE_MASCOT = ORIGINAL_OPENCLAUDE_MASCOT
    }
    ;(globalThis as Record<string, unknown>).MACRO = ORIGINAL_MACRO
    await rm(home, { recursive: true, force: true })
  })

  test('shows an actionable empty state in the compact fullscreen dashboard', async () => {
    const output = await renderDashboardFrame({
      fullscreen: true,
      predicate: frame => frame.includes('No background sessions'),
    })

    expect(output).toContain('Agent Dashboard')
    expect(output).toContain('No background sessions')
    expect(output).toContain(basename(home))
    expect(output).toContain('oMLX/local-router · acceptEdits')
    expect(output).toContain('Try "review this repo"')
    expect(output).toContain('Try "fix the failing tests"')
    expect(output).toContain('0 active · 0 needs input · 0 total')

    const visibleArtRows = TERMINAL_MASCOT_NAMES.flatMap(name =>
      getTerminalMascotRows(name)
        .map(row => row.trim())
        .filter(row => row.length >= 6),
    )
    for (const row of visibleArtRows) {
      expect(output).not.toContain(row)
    }
  })

  test('groups jobs by status and renders dense row details', async () => {
    const needsInput = await createBackgroundJob({
      name: 'Auth repair queue',
      prompt: 'collect login traces',
      cwd: home,
      provider: 'oMLX',
      model: 'qwen-local',
      agent: 'debugger',
      permissionMode: 'acceptEdits',
    })
    await updateJob(needsInput.id, {
      status: 'needs_input',
      latest_output_tail: 'Need token approval\n',
    })

    const completed = await createBackgroundJob({
      name: 'Fixture cleanup',
      prompt: 'remove stale fixtures',
      cwd: home,
      provider: 'OpenAI',
      model: 'gpt-4.1',
    })
    await updateJob(completed.id, {
      status: 'completed',
      latest_output_tail: 'All done\n',
    })

    const idle = await createBackgroundJob({
      name: 'Docs polish',
      prompt: 'tighten dashboard docs',
      cwd: home,
    })
    await updateJob(idle.id, { status: 'idle' })

    const output = await renderDashboardFrame({
      predicate: frame =>
        frame.includes('Needs input') &&
        frame.includes('Completed') &&
        frame.includes('Idle'),
    })

    expect(output.indexOf('Needs input')).toBeLessThan(output.indexOf('Completed'))
    expect(output.indexOf('Completed')).toBeLessThan(output.indexOf('Idle'))
    expect(output).toContain('Auth repair queue')
    expect(output).toContain('Need token approval')
    expect(output).toContain('oMLX/qwen-local')
    expect(output).toContain(`${needsInput.id} · main · acceptEdits · Needs input`)
    expect(output).toContain('oMLX/qwen-local · @debugger · acceptEdits · main')
    expect(output).toContain('Fixture cleanup')
    expect(output).toContain('All done')
    expect(output).toContain('Docs polish')
    expect(output).toContain('1 active · 1 needs input · 3 total')
  })
})
