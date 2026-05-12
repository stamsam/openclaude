import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/notifications.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { type Message } from '../types/message.js'
import { getContentText } from '../utils/messages.js'
import { renderDefaultModelSetting } from '../utils/model/model.js'
import { validateModel } from '../utils/model/validateModel.js'
import { getActiveProviderProfile } from '../utils/providerProfiles.js'
import {
  buildBtwPrompt,
  type TelegramCommand,
  getTelegramHelpText,
  parseTelegramCommand,
} from '../telegram/commands.js'
import { TelegramClient } from '../telegram/client.js'
import { splitTelegramMessage } from '../telegram/messageChunking.js'
import {
  BUSY_NOTICE_COOLDOWN_MS,
  createInitialChatRunState,
  markBusyNoticeSent,
  markOverlayNoticeSent,
  markRunCompleted,
  markRunStarted,
  markRunStopped,
  shouldAbortTelegramRun,
  shouldIgnoreUpdate,
  shouldSendOverlayNotice,
  shouldSendBusyNotice,
} from '../telegram/runtimeState.js'
import { getSavedTelegramSettings, resolveTelegramSetting } from '../telegram/settings.js'
import {
  formatTelegramTaskVisibility,
  type TelegramTaskVisibilityItem,
} from '../telegram/taskVisibility.js'
import { validateWorkspaceDir } from '../telegram/workspace.js'
import type { TelegramChatRunState } from '../telegram/types.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getTaskListId, listTasks, type Task } from '../utils/tasks.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import {
  buildSideQuestionCacheSafeParams,
  runSideQuestion,
} from '../utils/sideQuestion.js'

type Props = {
  isLoading: boolean
  messages: Message[]
  onSubmitMessage: (content: string) => boolean
  onAbortCurrent: () => void
  getSideQuestionContext: () => ProcessUserInputContext
}

type TelegramRuntimeConfig = {
  botToken: string
  allowedUserId: string
  workspace: string
}

type TelegramSideQuestionRun = {
  runId: string
  statusMessageId: number | null
  abortController: AbortController
}

const POLL_TIMEOUT_SECONDS = 30

function getTelegramRuntimeConfig(workspaceOverride?: string): TelegramRuntimeConfig {
  const saved = getSavedTelegramSettings()
  const botToken = resolveTelegramSetting(
    process.env.TELEGRAM_BOT_TOKEN,
    saved?.botToken,
  )
  const allowedUserId = resolveTelegramSetting(
    process.env.TELEGRAM_ALLOWED_USER_ID,
    saved?.allowedUserId,
  )
  if (!botToken) {
    throw new Error('Missing Telegram bot token. Run /telegram setup.')
  }
  if (!allowedUserId) {
    throw new Error('Missing Telegram allowed user ID. Run /telegram setup.')
  }
  const workspace = validateWorkspaceDir(
    (workspaceOverride ||
      process.env.OPENCLAUDE_WORKSPACE_DIR?.trim() ||
      process.env.WORKSPACE_DIR?.trim() ||
      getCwd()
    ).trim(),
  )
  return { botToken, allowedUserId, workspace }
}

function extractVisibleMessageText(message: Message): string | null {
  const typed = message as {
    type?: string
    content?: string
    message?: { content?: string | Array<{ type: string; text?: string }> }
  }

  if (typed.type === 'user') return null
  if (typeof typed.content === 'string') return typed.content.trim() || null

  const nestedContent = typed.message?.content
  if (typeof nestedContent === 'string') return nestedContent.trim() || null
  if (Array.isArray(nestedContent)) {
    return getContentText(nestedContent) || null
  }
  return null
}

function formatStatus(params: {
  enabled: boolean
  connected: boolean
  paused: boolean
  workspace: string
  error?: string
  activeRunId?: string | null
  localOverlayKind?: string | null
  modelLabel?: string
  providerLabel?: string
  taskSummary?: string
}): string {
  return [
    `Telegram bridge: ${params.enabled ? (params.connected ? 'on' : 'starting') : 'off'}`,
    `State: ${params.activeRunId ? 'busy' : 'idle'}`,
    `Paused: ${params.paused ? 'yes' : 'no'}`,
    params.activeRunId ? `Run ID: ${params.activeRunId}` : undefined,
    params.localOverlayKind ? `Local overlay: /${params.localOverlayKind}` : undefined,
    params.modelLabel ? `Model: ${params.modelLabel}` : undefined,
    params.providerLabel ? `Provider: ${params.providerLabel}` : undefined,
    `Workspace: ${params.workspace}`,
    params.taskSummary,
    params.error ? `Last error: ${params.error}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

function toTelegramTaskItem(task: Task): TelegramTaskVisibilityItem {
  return {
    id: task.id,
    status: task.status,
    subject: task.subject || task.description || 'Task',
    owner: task.owner,
    blockedBy: task.blockedBy,
  }
}

async function formatCombinedTaskSummary(
  liveTasks: Record<string, unknown> | undefined,
): Promise<string> {
  const liveTaskItems = Object.entries(liveTasks ?? {}).map(([taskId, raw]) => {
    const task = raw as {
      id?: string
      status?: string
      description?: string
      type?: string
      owner?: string
      blockedBy?: string[]
    }
    return {
      id: task.id || taskId,
      status: task.status || 'unknown',
      subject: task.description || task.type || 'Task',
      owner: task.owner,
      blockedBy: task.blockedBy,
    } satisfies TelegramTaskVisibilityItem
  })

  try {
    const persistentTasks = await listTasks(getTaskListId())
    const taskItems = [
      ...persistentTasks.map(toTelegramTaskItem),
      ...liveTaskItems,
    ]
    return formatTelegramTaskVisibility(taskItems, {
      heading: 'Tasks',
      maxItems: 5,
    })
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Task list could not be read.'
    if (liveTaskItems.length > 0) {
      return [
        formatTelegramTaskVisibility(liveTaskItems, {
          heading: 'Tasks',
          maxItems: 5,
        }),
        `Persistent task list unavailable: ${detail}`,
      ].join('\n')
    }
    return formatTelegramTaskVisibility([], {
      heading: 'Tasks',
      maxItems: 5,
      unavailableReason: detail,
    })
  }
}

function getProviderLabel(): string | undefined {
  const activeProfile = getActiveProviderProfile()
  if (activeProfile) {
    return activeProfile.name || activeProfile.provider
  }

  if (process.env.OPENAI_BASE_URL?.trim()) {
    return process.env.OPENAI_BASE_URL.trim()
  }

  return undefined
}

async function sendChunkedMessage(
  client: TelegramClient,
  chatId: number,
  text: string,
): Promise<number | null> {
  let firstMessageId: number | null = null
  for (const chunk of splitTelegramMessage(text)) {
    const result = await client.sendMessage(chatId, chunk)
    if (firstMessageId === null) {
      firstMessageId = result.message_id
    }
  }
  return firstMessageId
}

async function finalizeResponse(
  client: TelegramClient,
  chatId: number,
  statusMessageId: number | null,
  text: string,
): Promise<void> {
  const chunks = splitTelegramMessage(text)
  if (statusMessageId !== null && chunks.length > 0) {
    await client.editMessageText(chatId, statusMessageId, chunks[0]!)
    for (const chunk of chunks.slice(1)) {
      await client.sendMessage(chatId, chunk)
    }
    return
  }

  await sendChunkedMessage(client, chatId, text)
}

function safeReadRuntimeConfig(
  workspaceOverride?: string,
): TelegramRuntimeConfig | null {
  try {
    return getTelegramRuntimeConfig(workspaceOverride)
  } catch {
    return null
  }
}

export function useTelegramBridge({
  isLoading,
  messages,
  onSubmitMessage,
  onAbortCurrent,
  getSideQuestionContext,
}: Props): void {
  const { addNotification } = useNotifications()
  const setAppState = useSetAppState()
  const enabled = useAppState(s => s.telegramBridgeEnabled ?? false)
  const paused = useAppState(s => s.telegramBridgePaused ?? false)
  const workspaceOverride = useAppState(s => s.telegramBridgeWorkspaceDir)
  const configVersion = useAppState(s => s.telegramBridgeConfigVersion ?? 0)
  const currentModel = useAppState(s => s.mainLoopModel)
  const error = useAppState(s => s.telegramBridgeError)
  const tasks = useAppState(s => s.tasks)
  const activeLocalOverlayKind = useAppState(s => s.activeLocalOverlayKind)
  const activeLocalOverlaySequence = useAppState(
    s => s.activeLocalOverlaySequence ?? 0,
  )

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading
  const workspaceOverrideRef = useRef(workspaceOverride)
  workspaceOverrideRef.current = workspaceOverride
  const latestMessagesRef = useRef(messages)
  latestMessagesRef.current = messages
  const chatStatesRef = useRef<Map<number, TelegramChatRunState>>(new Map())
  const sideQuestionRunsRef = useRef<Map<number, TelegramSideQuestionRun>>(
    new Map(),
  )
  const activeChatIdRef = useRef<number | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const runSequenceRef = useRef(0)
  const lastGlobalUpdateIdRef = useRef<number | null>(null)
  const modelLabelRef = useRef(
    currentModel ? renderDefaultModelSetting(currentModel) : 'unknown',
  )
  modelLabelRef.current = currentModel
    ? renderDefaultModelSetting(currentModel)
    : 'unknown'
  const providerLabelRef = useRef(getProviderLabel())
  providerLabelRef.current = getProviderLabel()
  const errorRef = useRef(error)
  errorRef.current = error
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const activeLocalOverlayKindRef = useRef(activeLocalOverlayKind)
  activeLocalOverlayKindRef.current = activeLocalOverlayKind
  const activeLocalOverlaySequenceRef = useRef(activeLocalOverlaySequence)
  activeLocalOverlaySequenceRef.current = activeLocalOverlaySequence
  const onSubmitMessageRef = useRef(onSubmitMessage)
  onSubmitMessageRef.current = onSubmitMessage
  const onAbortCurrentRef = useRef(onAbortCurrent)
  onAbortCurrentRef.current = onAbortCurrent
  const getSideQuestionContextRef = useRef(getSideQuestionContext)
  getSideQuestionContextRef.current = getSideQuestionContext

  useEffect(() => {
    const activeChatId = activeChatIdRef.current
    const activeRunId = activeRunIdRef.current
    if (!activeChatId || !activeRunId || isLoading) return

    const state = chatStatesRef.current.get(activeChatId)
    if (!state || state.activeRunId !== activeRunId) return

    const tail = latestMessagesRef.current.slice(state.baselineCount)
    const lastVisible = [...tail]
      .reverse()
      .map(extractVisibleMessageText)
      .find(Boolean)

    if (!lastVisible) return

    const config = safeReadRuntimeConfig(workspaceOverrideRef.current)
    if (!config) return

    chatStatesRef.current.set(activeChatId, markRunCompleted(state))
    activeChatIdRef.current = null
    activeRunIdRef.current = null
    logForDebugging(
      `[telegram:session] run completed chat=${activeChatId} run=${activeRunId}`,
    )

    const client = new TelegramClient(config.botToken)
    void finalizeResponse(
      client,
      activeChatId,
      state.activeStatusMessageId,
      lastVisible,
    )
  }, [isLoading, messages])

  useEffect(() => {
    if (!enabled) {
      setAppState(prev =>
        prev.telegramBridgeConnected || prev.telegramBridgeError
          ? {
              ...prev,
              telegramBridgeConnected: false,
              telegramBridgeError: undefined,
            }
          : prev,
      )
      return
    }

    let cancelled = false
    let offset: number | undefined

    const config = safeReadRuntimeConfig(workspaceOverrideRef.current)
    if (!config) {
      setAppState(prev => ({
        ...prev,
        telegramBridgeConnected: false,
        telegramBridgeError:
          'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID. Run /telegram setup.',
        telegramBridgeEnabled: false,
      }))
      addNotification({
        key: 'telegram-bridge-error',
        priority: 'immediate',
        text: 'Telegram bridge needs TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID. Run /telegram setup.',
      })
      return
    }

    const client = new TelegramClient(config.botToken)

    const getChatState = (chatId: number): TelegramChatRunState => {
      return chatStatesRef.current.get(chatId) ?? createInitialChatRunState()
    }

    const saveChatState = (chatId: number, state: TelegramChatRunState): void => {
      chatStatesRef.current.set(chatId, state)
    }

    const sendBusyNoticeIfNeeded = async (chatId: number): Promise<void> => {
      const now = Date.now()
      const current = getChatState(chatId)
      if (!shouldSendBusyNotice(current, now)) {
        logForDebugging(
          `[telegram:session] busy duplicate suppressed chat=${chatId} run=${current.activeRunId ?? 'none'}`,
        )
        return
      }
      saveChatState(chatId, markBusyNoticeSent(current, now))
      logForDebugging(
        `[telegram:session] busy notice sent chat=${chatId} run=${current.activeRunId ?? 'none'}`,
      )
      if (current.activeStatusMessageId !== null) {
        await client.editMessageText(
          chatId,
          current.activeStatusMessageId,
          'Still working on the previous request. Use /stop to cancel.',
        )
      } else {
        await sendChunkedMessage(
          client,
          chatId,
          'Still working on the previous request. Use /stop to cancel.',
        )
      }
    }

    const sendOverlayNoticeIfNeeded = async (chatId: number): Promise<void> => {
      const overlayKind = activeLocalOverlayKindRef.current
      const overlaySequence = activeLocalOverlaySequenceRef.current
      if (!overlayKind || overlaySequence <= 0) return

      const current = getChatState(chatId)
      if (!shouldSendOverlayNotice(current, overlaySequence)) {
        logForDebugging(
          `[telegram:session] overlay duplicate suppressed chat=${chatId} overlay=${overlayKind} sequence=${overlaySequence}`,
        )
        return
      }

      saveChatState(chatId, markOverlayNoticeSent(current, overlaySequence))
      await sendChunkedMessage(
        client,
        chatId,
        `Local /${overlayKind} is open in OpenClaude. Use /dismiss to close it first.`,
      )
    }

    const submitPrompt = async (
      chatId: number,
      prompt: string,
      statusText: string,
    ): Promise<void> => {
      if (pausedRef.current) {
        await sendChunkedMessage(client, chatId, 'Bridge is paused. Use /resume first.')
        return
      }
      if (isLoadingRef.current || activeRunIdRef.current) {
        await sendBusyNoticeIfNeeded(chatId)
        return
      }

      const ok = onSubmitMessageRef.current(prompt)
      if (!ok) {
        await sendBusyNoticeIfNeeded(chatId)
        return
      }

      const runId = `tg-${Date.now()}-${++runSequenceRef.current}`
      const statusMessageId = await sendChunkedMessage(client, chatId, statusText)
      const state = markRunStarted(
        getChatState(chatId),
        runId,
        latestMessagesRef.current.length,
        statusMessageId,
      )
      saveChatState(chatId, state)
      activeChatIdRef.current = chatId
      activeRunIdRef.current = runId
      logForDebugging(`[telegram:session] idle -> busy chat=${chatId} run=${runId}`)
    }

    const dismissLocalOverlay = async (chatId: number): Promise<void> => {
      const overlayKind = activeLocalOverlayKindRef.current
      const submitted = onSubmitMessageRef.current('/dismiss')
      if (submitted) {
        await sendChunkedMessage(
          client,
          chatId,
          overlayKind
            ? `Dismiss requested for /${overlayKind}.`
            : 'Dismiss requested.',
        )
        return
      }

      if (!overlayKind) {
        await sendChunkedMessage(client, chatId, 'Nothing to dismiss.')
        return
      }

      setAppState(prev => ({
        ...prev,
        dismissLocalOverlayRequestNonce:
          (prev.dismissLocalOverlayRequestNonce ?? 0) + 1,
      }))
      await sendChunkedMessage(client, chatId, `Dismissed /${overlayKind}.`)
    }

    const answerTelegramSideQuestion = async (
      chatId: number,
      prompt: string,
    ): Promise<void> => {
      if (pausedRef.current) {
        await sendChunkedMessage(client, chatId, 'Bridge is paused. Use /resume first.')
        return
      }
      if (sideQuestionRunsRef.current.has(chatId)) {
        await sendBusyNoticeIfNeeded(chatId)
        return
      }

      const statusMessageId = await sendChunkedMessage(
        client,
        chatId,
        'Answering side question... Use /stop to cancel.',
      )
      const runId = `tg-btw-${Date.now()}-${++runSequenceRef.current}`
      const abortController = new AbortController()
      sideQuestionRunsRef.current.set(chatId, {
        runId,
        statusMessageId,
        abortController,
      })
      saveChatState(
        chatId,
        markRunStarted(
          getChatState(chatId),
          runId,
          latestMessagesRef.current.length,
          statusMessageId,
        ),
      )

      void (async () => {
        try {
          const sideContext = getSideQuestionContextRef.current()
          const cacheSafeParams =
            await buildSideQuestionCacheSafeParams(sideContext)
          const result = await runSideQuestion({
            question: buildBtwPrompt(prompt),
            cacheSafeParams,
            abortController,
          })
          if (abortController.signal.aborted) return
          await finalizeResponse(
            client,
            chatId,
            statusMessageId,
            result.response ?? 'No side-question response received.',
          )
        } catch (sideError) {
          if (abortController.signal.aborted) return
          const detail =
            sideError instanceof Error ? sideError.message : 'Side question failed.'
          await finalizeResponse(client, chatId, statusMessageId, detail)
        } finally {
          const current = sideQuestionRunsRef.current.get(chatId)
          if (current?.runId !== runId) return
          sideQuestionRunsRef.current.delete(chatId)
          const state = getChatState(chatId)
          if (state.activeRunId === runId) {
            saveChatState(chatId, markRunStopped(state))
          }
        }
      })()
    }

    async function handleCommand(command: TelegramCommand, chatId: number): Promise<void> {
      const state = getChatState(chatId)
      const taskSummary = await formatCombinedTaskSummary(tasksRef.current)
      const status = formatStatus({
        enabled: true,
        connected: true,
        paused: pausedRef.current,
        workspace: config.workspace,
        error: errorRef.current,
        activeRunId: state.activeRunId,
        localOverlayKind: activeLocalOverlayKindRef.current,
        modelLabel: modelLabelRef.current,
        providerLabel: providerLabelRef.current,
        taskSummary,
      })

      switch (command.type) {
        case 'help':
          await sendChunkedMessage(client, chatId, getTelegramHelpText())
          return
        case 'unknown_command':
          await sendChunkedMessage(
            client,
            chatId,
            `Bad command: ${command.command}. Use /help.`,
          )
          return
        case 'status':
          await sendChunkedMessage(client, chatId, status)
          return
        case 'pause':
          setAppState(prev => ({ ...prev, telegramBridgePaused: true }))
          await sendChunkedMessage(client, chatId, 'Paused. New Telegram prompts are blocked until /resume.')
          return
        case 'resume':
          setAppState(prev => ({ ...prev, telegramBridgePaused: false }))
          await sendChunkedMessage(client, chatId, 'Resumed. Telegram prompts are accepted again.')
          return
        case 'dismiss':
          await dismissLocalOverlay(chatId)
          return
        case 'stop':
          {
            const sideQuestionRun = sideQuestionRunsRef.current.get(chatId)
            if (sideQuestionRun) {
              sideQuestionRun.abortController.abort('telegram-stop')
              sideQuestionRunsRef.current.delete(chatId)
              if (sideQuestionRun.statusMessageId !== null) {
                await client.editMessageText(
                  chatId,
                  sideQuestionRun.statusMessageId,
                  'Stopped.',
                )
              } else {
                await sendChunkedMessage(client, chatId, 'Stopped.')
              }
              saveChatState(chatId, markRunStopped(state))
              logForDebugging(
                `[telegram:session] side question stopped chat=${chatId} run=${sideQuestionRun.runId}`,
              )
              return
            }
          }
          if (shouldAbortTelegramRun(state, activeRunIdRef.current)) {
            onAbortCurrentRef.current()
          }
          if (state.activeRunId && state.activeStatusMessageId !== null) {
            await client.editMessageText(chatId, state.activeStatusMessageId, 'Stopped.')
          } else if (state.activeRunId) {
            await sendChunkedMessage(client, chatId, 'Stopped.')
          } else if (activeLocalOverlayKindRef.current) {
            await dismissLocalOverlay(chatId)
          } else {
            await sendChunkedMessage(client, chatId, 'No active run.')
          }
          saveChatState(chatId, markRunStopped(state))
          activeChatIdRef.current = null
          activeRunIdRef.current = null
          logForDebugging(`[telegram:session] run stopped chat=${chatId}`)
          return
        case 'approve':
        case 'deny':
          await sendChunkedMessage(
            client,
            chatId,
            'Telegram approval relay is not wired into the live session yet. Approve locally in OpenClaude for now.',
          )
          return
        case 'model':
          if (!command.model) {
            await sendChunkedMessage(
              client,
              chatId,
              [
                `Model: ${modelLabelRef.current}`,
                providerLabelRef.current
                  ? `Provider: ${providerLabelRef.current}`
                  : "I can't read the active provider from OpenClaude yet.",
                '',
                'To switch: /model <name> or /models <name>',
              ].join('\n'),
            )
            return
          }
          if (pausedRef.current) {
            await sendChunkedMessage(client, chatId, 'Bridge is paused. Use /resume first.')
            return
          }
          if (isLoadingRef.current || activeRunIdRef.current) {
            await sendBusyNoticeIfNeeded(chatId)
            return
          }
          if (activeLocalOverlayKindRef.current) {
            await sendOverlayNoticeIfNeeded(chatId)
            return
          }
          try {
            const { valid, error } = await validateModel(command.model)
            if (!valid) {
              await sendChunkedMessage(
                client,
                chatId,
                error || `Model '${command.model}' not found.`,
              )
              return
            }
            setAppState(prev => ({
              ...prev,
              mainLoopModel: command.model,
              mainLoopModelForSession: null,
            }))
            modelLabelRef.current = renderDefaultModelSetting(command.model)
            await sendChunkedMessage(
              client,
              chatId,
              `Model set to ${modelLabelRef.current}.`,
            )
          } catch (validationError) {
            const detail =
              validationError instanceof Error
                ? validationError.message
                : 'Failed to validate model.'
            await sendChunkedMessage(client, chatId, detail)
          }
          return
        case 'btw':
          await answerTelegramSideQuestion(chatId, command.prompt)
          return
        case 'ask':
          if (activeLocalOverlayKindRef.current) {
            await sendOverlayNoticeIfNeeded(chatId)
            return
          }
          await submitPrompt(chatId, command.prompt, 'Working on it…')
          return
      }
    }

    async function loop(): Promise<void> {
      try {
        while (!cancelled) {
          const updates = await client.getUpdates(offset, POLL_TIMEOUT_SECONDS)
          for (const update of updates) {
            offset = update.update_id + 1
            if (shouldIgnoreUpdate(lastGlobalUpdateIdRef.current, update.update_id)) {
              logForDebugging(
                `[telegram:session] duplicate update ignored update=${update.update_id}`,
              )
              continue
            }
            lastGlobalUpdateIdRef.current = update.update_id

            const message = update.message
            if (!message?.text || !message.from) continue
            if (String(message.from.id) !== config.allowedUserId) continue

            const current = getChatState(message.chat.id)
            saveChatState(message.chat.id, {
              ...current,
              lastProcessedUpdateId: update.update_id,
            })
            const command = parseTelegramCommand(message.text)
            await handleCommand(command, message.chat.id)
          }
        }
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Telegram bridge failed'
        logForDebugging(`[telegram:session] ${detail}`, { level: 'error' })
        if (!cancelled) {
          setAppState(prev => ({
            ...prev,
            telegramBridgeConnected: false,
            telegramBridgeError: detail,
            telegramBridgeEnabled: false,
          }))
          addNotification({
            key: 'telegram-bridge-runtime-error',
            priority: 'immediate',
            text: `Telegram bridge stopped: ${detail}`,
          })
        }
      }
    }

    async function start(): Promise<void> {
      try {
        const bootstrapUpdates = await client.getUpdates(undefined, 0)
        if (bootstrapUpdates.length > 0) {
          offset = bootstrapUpdates[bootstrapUpdates.length - 1]!.update_id + 1
          lastGlobalUpdateIdRef.current = offset - 1
          logForDebugging(
            `[telegram:session] startup backlog skipped count=${bootstrapUpdates.length} lastUpdate=${lastGlobalUpdateIdRef.current}`,
          )
        }
        if (cancelled) return
        setAppState(prev => ({
          ...prev,
          telegramBridgeConnected: true,
          telegramBridgeError: undefined,
        }))
        await loop()
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Telegram bridge failed'
        logForDebugging(`[telegram:session] ${detail}`, { level: 'error' })
        if (!cancelled) {
          setAppState(prev => ({
            ...prev,
            telegramBridgeConnected: false,
            telegramBridgeError: detail,
            telegramBridgeEnabled: false,
          }))
          addNotification({
            key: 'telegram-bridge-runtime-error',
            priority: 'immediate',
            text: `Telegram bridge stopped: ${detail}`,
          })
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      setAppState(prev =>
        prev.telegramBridgeConnected
          ? { ...prev, telegramBridgeConnected: false }
          : prev,
      )
    }
  }, [addNotification, configVersion, enabled, setAppState, workspaceOverride])
}
