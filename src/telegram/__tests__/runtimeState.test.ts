import { describe, expect, test } from 'bun:test'
import {
  BUSY_NOTICE_COOLDOWN_MS,
  createInitialChatRunState,
  markBusyNoticeSent,
  markOverlayNoticeSent,
  markRunCompleted,
  markRunStarted,
  markRunStopped,
  shouldIgnoreUpdate,
  shouldSendOverlayNotice,
  shouldSendBusyNotice,
} from '../runtimeState.js'

describe('telegram runtime state', () => {
  test('duplicate update is processed once', () => {
    expect(shouldIgnoreUpdate(null, 10)).toBe(false)
    expect(shouldIgnoreUpdate(10, 10)).toBe(true)
    expect(shouldIgnoreUpdate(10, 9)).toBe(true)
    expect(shouldIgnoreUpdate(10, 11)).toBe(false)
  })

  test('multiple messages during busy produce only one busy notice before cooldown', () => {
    const started = markRunStarted(createInitialChatRunState(), 'run-1', 4, 123)
    expect(shouldSendBusyNotice(started, 1_000)).toBe(true)
    const afterNotice = markBusyNoticeSent(started, 1_000)
    expect(shouldSendBusyNotice(afterNotice, 2_000)).toBe(false)
    expect(shouldSendBusyNotice(afterNotice, 1_000 + BUSY_NOTICE_COOLDOWN_MS + 1)).toBe(true)
  })

  test('/stop resets state', () => {
    const started = markRunStarted(createInitialChatRunState(), 'run-1', 4, 123)
    const stopped = markRunStopped(markBusyNoticeSent(started, 1_000))
    expect(stopped.activeRunId).toBeNull()
    expect(stopped.activeStatusMessageId).toBeNull()
    expect(stopped.busyNoticeSentForRun).toBe(false)
  })

  test('run completion resets state', () => {
    const started = markRunStarted(createInitialChatRunState(), 'run-1', 4, 123)
    const completed = markRunCompleted(started)
    expect(completed.activeRunId).toBeNull()
    expect(completed.activeStatusMessageId).toBeNull()
    expect(completed.baselineCount).toBe(0)
  })

  test('overlay notices send once per overlay sequence', () => {
    const initial = createInitialChatRunState()
    expect(shouldSendOverlayNotice(initial, 2)).toBe(true)
    const notified = markOverlayNoticeSent(initial, 2)
    expect(shouldSendOverlayNotice(notified, 2)).toBe(false)
    expect(shouldSendOverlayNotice(notified, 3)).toBe(true)
  })
})
