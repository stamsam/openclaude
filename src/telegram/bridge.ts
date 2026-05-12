import { createHash } from 'node:crypto'
import {
  getTaskListId,
  listTasks,
  type Task as PersistentTask,
} from '../utils/tasks.js'
import { TelegramClient } from './client.js'
import { buildBtwPrompt, getTelegramHelpText, parseTelegramCommand } from './commands.js'
import { loadTelegramBridgeConfig, describeTelegramBridgeConfig } from './config.js'
import { OpenClaudeGrpcClient } from './grpcClient.js'
import { splitTelegramMessage } from './messageChunking.js'
import {
  formatTelegramTaskVisibility,
  type TelegramTaskVisibilityItem,
} from './taskVisibility.js'
import type {
  ApprovalPrompt,
  BridgeStatusSnapshot,
  TelegramBridgeConfig,
  TelegramMessage,
} from './types.js'

const STREAM_EDIT_INTERVAL_MS = 1000

export async function telegramMain(): Promise<void> {
  const config = loadTelegramBridgeConfig()
  const bridge = new TelegramBridge(config)
  console.log(describeTelegramBridgeConfig(config))
  await bridge.run()
}

class TelegramBridge {
  private readonly telegram: TelegramClient
  private readonly grpc: OpenClaudeGrpcClient
  private readonly sessionId: string
  private offset: number | undefined
  private paused = false
  private running = true
  private currentRunId: string | null = null
  private currentStreamMessage: {
    chatId: number
    messageId: number
    lastRenderedText: string
    lastEditAt: number
  } | null = null
  private pendingApprovals = new Map<string, ApprovalPrompt>()
  private runCounter = 0
  private selectedModel: string | undefined

  constructor(private readonly config: TelegramBridgeConfig) {
    this.telegram = new TelegramClient(config.botToken)
    this.grpc = new OpenClaudeGrpcClient(config.grpcHost, config.grpcPort)
    this.sessionId = `telegram-bridge-${stableWorkspaceId(config.workspaceDir)}`
  }

  async run(): Promise<void> {
    const shutdown = () => {
      this.running = false
      this.grpc.close()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    while (this.running) {
      const updates = await this.telegram.getUpdates(this.offset)
      for (const update of updates) {
        this.offset = update.update_id + 1
        await this.handleMessage(update.message)
      }
    }
  }

  private async handleMessage(message?: TelegramMessage): Promise<void> {
    if (!message?.text || !message.from) {
      return
    }

    if (String(message.from.id) !== this.config.allowedUserId) {
      return
    }

    const command = parseTelegramCommand(message.text)
    switch (command.type) {
      case 'help':
        await this.telegram.sendMessage(message.chat.id, getTelegramHelpText())
        return
      case 'status':
        await this.telegram.sendMessage(
          message.chat.id,
          formatStatus(await this.getStatusSnapshot()),
        )
        return
      case 'pause':
        this.paused = true
        await this.telegram.sendMessage(
          message.chat.id,
          'Paused. New prompts are blocked until /resume.',
        )
        return
      case 'resume':
        this.paused = false
        await this.telegram.sendMessage(
          message.chat.id,
          'Resumed. New prompts are accepted again.',
        )
        return
      case 'stop':
        if (!this.currentRunId) {
          await this.telegram.sendMessage(message.chat.id, 'No active run.')
          return
        }
        this.grpc.cancelCurrent()
        this.pendingApprovals.clear()
        await this.telegram.sendMessage(message.chat.id, 'Stop requested.')
        return
      case 'dismiss':
        await this.telegram.sendMessage(
          message.chat.id,
          '/dismiss is only available in the live in-session Telegram bridge.',
        )
        return
      case 'model':
        if (!command.model) {
          await this.telegram.sendMessage(
            message.chat.id,
            `Selected model: ${this.selectedModel ?? 'server default'}`,
          )
          return
        }
        this.selectedModel = command.model
        await this.telegram.sendMessage(
          message.chat.id,
          `Selected model for Telegram runs: ${this.selectedModel}`,
        )
        return
      case 'unknown_command':
        await this.telegram.sendMessage(
          message.chat.id,
          `Unknown command: ${command.command}\n\n${getTelegramHelpText()}`,
        )
        return
      case 'approve':
      case 'deny': {
        const approval = this.findApproval(command.id)
        if (!approval) {
          await this.telegram.sendMessage(
            message.chat.id,
            `Unknown approval id: ${command.id}`,
          )
          return
        }
        this.pendingApprovals.delete(approval.fullId)
        this.grpc.respondToPrompt(
          approval.fullId,
          command.type === 'approve',
        )
        await this.telegram.sendMessage(
          message.chat.id,
          `${command.type === 'approve' ? 'Approved' : 'Denied'} ${approval.shortId}.`,
        )
        return
      }
      case 'ask':
      case 'btw':
        if (this.paused) {
          await this.telegram.sendMessage(
            message.chat.id,
            'Bridge is paused. Use /resume first.',
          )
          return
        }
        if (this.currentRunId) {
          await this.telegram.sendMessage(
            message.chat.id,
            'A run is already active. Use /status or /stop first.',
          )
          return
        }
        await this.runPrompt(
          message.chat.id,
          message.message_id,
          command.type === 'btw'
            ? buildBtwPrompt(command.prompt)
            : command.prompt,
          command.type === 'btw'
            ? 'Running side investigation...'
            : 'Working...',
        )
        return
    }
  }

  private async runPrompt(
    chatId: number,
    replyToMessageId: number,
    prompt: string,
    placeholderText: string,
  ): Promise<void> {
    this.currentRunId = `run-${++this.runCounter}`
    const placeholder = await this.telegram.sendMessage(
      chatId,
      placeholderText,
      replyToMessageId,
    )
    this.currentStreamMessage = {
      chatId,
      messageId: placeholder.message_id,
      lastRenderedText: placeholderText,
      lastEditAt: 0,
    }

    let streamedText = ''
    try {
      const finalText = await this.grpc.runPrompt(
        prompt,
        {
          sessionId: this.sessionId,
          workspaceDir: this.config.workspaceDir,
          model: this.selectedModel,
        },
        {
          onTextChunk: text => {
            streamedText += text
            void this.maybeEditStreamMessage(streamedText)
          },
          onActionRequired: (promptId, question) => {
            const shortId = promptId.slice(0, 8)
            this.pendingApprovals.set(promptId, {
              fullId: promptId,
              shortId,
              question,
            })
            void this.telegram.sendMessage(
              chatId,
              `Approval needed (${shortId}). ${question}\nReply /approve ${shortId} or /deny ${shortId}`,
              replyToMessageId,
            )
          },
        },
      )

      const effectiveText = finalText || streamedText || '(no response)'
      await this.flushFinalText(effectiveText)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Telegram bridge run failed'
      await this.flushFinalText(`Error: ${message}`)
    } finally {
      this.currentRunId = null
      this.currentStreamMessage = null
      this.pendingApprovals.clear()
    }
  }

  private async maybeEditStreamMessage(text: string): Promise<void> {
    const stream = this.currentStreamMessage
    if (!stream || !text) {
      return
    }

    const preview = splitTelegramMessage(text)[0] ?? text
    const now = Date.now()
    if (
      preview === stream.lastRenderedText ||
      now - stream.lastEditAt < STREAM_EDIT_INTERVAL_MS
    ) {
      return
    }

    stream.lastRenderedText = preview
    stream.lastEditAt = now
    await this.telegram.editMessageText(stream.chatId, stream.messageId, preview)
  }

  private async flushFinalText(text: string): Promise<void> {
    const stream = this.currentStreamMessage
    if (!stream) {
      return
    }

    const chunks = splitTelegramMessage(text)
    if (chunks.length === 0) {
      await this.telegram.editMessageText(
        stream.chatId,
        stream.messageId,
        '(empty response)',
      )
      return
    }

    await this.telegram.editMessageText(
      stream.chatId,
      stream.messageId,
      chunks[0]!,
    )
    for (const chunk of chunks.slice(1)) {
      await this.telegram.sendMessage(stream.chatId, chunk)
    }
  }

  private findApproval(token: string): ApprovalPrompt | undefined {
    const normalized = token.trim().toLowerCase()
    for (const approval of this.pendingApprovals.values()) {
      if (
        approval.fullId.toLowerCase() === normalized ||
        approval.shortId.toLowerCase() === normalized
      ) {
        return approval
      }
    }
    return undefined
  }

  private async getStatusSnapshot(): Promise<BridgeStatusSnapshot> {
    return {
      workspaceDir: this.config.workspaceDir,
      paused: this.paused,
      activeRunId: this.currentRunId,
      pendingApprovalIds: [...this.pendingApprovals.values()].map(
        approval => approval.shortId,
      ),
      selectedModel: this.selectedModel,
      taskVisibility: await readTaskVisibility(),
    }
  }
}

function stableWorkspaceId(workspaceDir: string): string {
  return createHash('sha1').update(workspaceDir).digest('hex').slice(0, 12)
}

function formatStatus(snapshot: BridgeStatusSnapshot): string {
  const approvals =
    snapshot.pendingApprovalIds.length > 0
      ? snapshot.pendingApprovalIds.join(', ')
      : 'none'
  return [
    'OpenClaude Telegram bridge',
    `workspace: ${snapshot.workspaceDir}`,
    `paused: ${snapshot.paused ? 'yes' : 'no'}`,
    `model: ${snapshot.selectedModel ?? 'server default'}`,
    `active run: ${snapshot.activeRunId ?? 'none'}`,
    `pending approvals: ${approvals}`,
    snapshot.taskVisibility,
  ].join('\n')
}

async function readTaskVisibility(): Promise<string> {
  try {
    const taskListId = getTaskListId()
    const tasks = await listTasks(taskListId)
    return formatTelegramTaskVisibility(tasks.map(toTelegramTaskItem), {
      heading: `Tasks (${taskListId})`,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not read task list.'
    return formatTelegramTaskVisibility([], {
      heading: 'Tasks',
      unavailableReason: message,
    })
  }
}

function toTelegramTaskItem(task: PersistentTask): TelegramTaskVisibilityItem {
  return {
    id: task.id,
    status: task.status,
    subject: task.subject || task.description || 'Task',
    owner: task.owner,
    blockedBy: task.blockedBy,
  }
}
