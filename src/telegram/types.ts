export type TelegramBridgeConfig = {
  botToken: string
  allowedUserId: string
  grpcHost: string
  grpcPort: number
  workspaceDir: string
  unsafeGrpcAllowed: boolean
}

export type ParsedTelegramCommand =
  | { type: 'status' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'dismiss' }
  | { type: 'help' }
  | { type: 'unknown_command'; command: string }
  | { type: 'approve'; id: string }
  | { type: 'deny'; id: string }
  | { type: 'ask'; prompt: string }
  | { type: 'btw'; prompt: string }
  | { type: 'model'; model?: string }

export type TelegramUser = {
  id: number
  username?: string
}

export type TelegramChat = {
  id: number
  type: string
}

export type TelegramMessage = {
  message_id: number
  chat: TelegramChat
  from?: TelegramUser
  text?: string
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

export type TelegramSendMessageResult = {
  message_id: number
}

export type ApprovalPrompt = {
  fullId: string
  shortId: string
  question: string
}

export type BridgeStatusSnapshot = {
  workspaceDir: string
  paused: boolean
  activeRunId: string | null
  pendingApprovalIds: string[]
}

export type TelegramChatRunState = {
  activeRunId: string | null
  activeStatusMessageId: number | null
  busyNoticeSentForRun: boolean
  lastBusyNoticeAt: number | null
  pendingPromptCount: number
  lastProcessedUpdateId: number | null
  baselineCount: number
  lastOverlayNoticeSequence: number | null
}
