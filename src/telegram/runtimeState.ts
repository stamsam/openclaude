import type { TelegramChatRunState } from './types.js'

export const BUSY_NOTICE_COOLDOWN_MS = 60_000

export function createInitialChatRunState(): TelegramChatRunState {
  return {
    activeRunId: null,
    activeStatusMessageId: null,
    busyNoticeSentForRun: false,
    lastBusyNoticeAt: null,
    pendingPromptCount: 0,
    lastProcessedUpdateId: null,
    baselineCount: 0,
    lastOverlayNoticeSequence: null,
  }
}

export function shouldIgnoreUpdate(
  lastProcessedUpdateId: number | null,
  updateId: number,
): boolean {
  return lastProcessedUpdateId !== null && updateId <= lastProcessedUpdateId
}

export function shouldSendBusyNotice(
  state: TelegramChatRunState,
  now: number,
): boolean {
  if (!state.activeRunId) return true
  if (!state.busyNoticeSentForRun) return true
  if (state.lastBusyNoticeAt === null) return true
  return now - state.lastBusyNoticeAt >= BUSY_NOTICE_COOLDOWN_MS
}

export function markRunStarted(
  state: TelegramChatRunState,
  runId: string,
  baselineCount: number,
  statusMessageId: number,
): TelegramChatRunState {
  return {
    ...state,
    activeRunId: runId,
    activeStatusMessageId: statusMessageId,
    busyNoticeSentForRun: false,
    lastBusyNoticeAt: null,
    pendingPromptCount: 0,
    baselineCount,
  }
}

export function shouldSendOverlayNotice(
  state: TelegramChatRunState,
  overlaySequence: number,
): boolean {
  return state.lastOverlayNoticeSequence !== overlaySequence
}

export function markOverlayNoticeSent(
  state: TelegramChatRunState,
  overlaySequence: number,
): TelegramChatRunState {
  return {
    ...state,
    lastOverlayNoticeSequence: overlaySequence,
  }
}

export function markBusyNoticeSent(
  state: TelegramChatRunState,
  now: number,
): TelegramChatRunState {
  return {
    ...state,
    busyNoticeSentForRun: true,
    lastBusyNoticeAt: now,
  }
}

export function markRunStopped(state: TelegramChatRunState): TelegramChatRunState {
  return {
    ...state,
    activeRunId: null,
    activeStatusMessageId: null,
    busyNoticeSentForRun: false,
    lastBusyNoticeAt: null,
    pendingPromptCount: 0,
    baselineCount: 0,
    lastOverlayNoticeSequence: null,
  }
}

export const markRunCompleted = markRunStopped
