import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import React from 'react'
import stripAnsi from 'strip-ansi'

import { createRoot } from '../../ink.js'
import { SpinnerAnimationRow } from './SpinnerAnimationRow.js'

const SYNC_START = '\x1B[?2026h'
const SYNC_END = '\x1B[?2026l'

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
    if (frame.trim().length > 0) lastFrame = frame
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
  ;(stdout as unknown as { columns: number }).columns = 120
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  return {
    stdout,
    stdin,
    getOutput: () => output,
  }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2000) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error('Timed out waiting for SpinnerAnimationRow test condition')
}

function renderSpinnerRow(
  props: Partial<React.ComponentProps<typeof SpinnerAnimationRow>>,
): React.ReactElement {
  const now = Date.now()
  return (
    <SpinnerAnimationRow
      mode="thinking"
      reducedMotion={true}
      hasActiveTools={false}
      responseLengthRef={{ current: 0 }}
      message="Building..."
      messageColor="claude"
      shimmerColor="claudeShimmer"
      loadingStartTimeRef={{ current: now }}
      totalPausedMsRef={{ current: 0 }}
      pauseStartTimeRef={{ current: null }}
      verbose={false}
      columns={120}
      hasRunningTeammates={false}
      teammateTokens={0}
      foregroundedTeammate={undefined}
      leaderIsIdle={false}
      thinkingStatus={null}
      effortSuffix=""
      {...props}
    />
  )
}

test('SpinnerAnimationRow shows animated ultracode as a separate status badge', async () => {
  const streams = createTestStreams()
  const root = await createRoot({
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  })

  root.render(
    renderSpinnerRow({
      ultracodeActive: true,
      thinkingStatus: 'thinking',
      effortSuffix: ' with ultracode',
    }),
  )

  await waitForCondition(() => streams.getOutput().includes('ultracode'))

  const frame = stripAnsi(extractLastFrame(streams.getOutput()))
  expect(frame).toContain('ultracode')
  expect(frame).toContain('thinking')
  expect(frame).not.toContain('thinking with ultracode')

  root.unmount()
})

test('SpinnerAnimationRow shows xhigh badge for max effort turns', async () => {
  const streams = createTestStreams()
  const root = await createRoot({
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  })

  root.render(
    renderSpinnerRow({
      mode: 'requesting',
      effortSuffix: ' with max effort',
    }),
  )

  await waitForCondition(() => streams.getOutput().includes('xhigh'))

  const frame = stripAnsi(extractLastFrame(streams.getOutput()))
  expect(frame).toContain('xhigh')

  root.unmount()
})
