import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/notifications.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import type { Message } from '../types/message.js'
import { getContentText } from '../utils/messages.js'
import { renderDefaultModelSetting } from '../utils/model/model.js'
import {
  getActiveProviderProfile,
  getProviderProfiles,
} from '../utils/providerProfiles.js'
import { logForDebugging } from '../utils/debug.js'
import {
  startMobileServer,
  type MobileServerHandle,
  type MobileServerSubmitResult,
  type MobileServerTimelineItem,
} from '../mobileServer/server.js'
import { readMobileServerTokens } from '../mobileServer/tokenStore.js'
import {
  enableYoloPermissionMode,
  isPermissionsYoloCommand,
} from '../utils/permissions/yoloPermissionMode.js'

type Props = {
  isLoading: boolean
  messages: Message[]
  onSubmitMessage: (content: string) => boolean
  onAbortCurrent: () => void
}

type ActiveMobileRun = {
  id: string
  baselineCount: number
}

let mobileServerLifecycle = Promise.resolve()

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

function extractTimelineRole(message: Message): MobileServerTimelineItem['role'] {
  const typed = message as { type?: string; role?: string }
  const role = typed.role || typed.type
  if (role === 'user') return 'user'
  if (role === 'system') return 'system'
  return 'assistant'
}

function extractMobileTimeline(messages: Message[]): MobileServerTimelineItem[] {
  return messages
    .map((message, index) => {
      const text = extractTimelineText(message)
      if (!text) return null
      return {
        id: extractTimelineId(message, index),
        role: extractTimelineRole(message),
        text,
      }
    })
    .filter((item): item is MobileServerTimelineItem => !!item)
    .slice(-60)
}

function extractTimelineId(message: Message, index: number): string {
  const typed = message as { id?: string; message?: { id?: string } }
  return typed.id || typed.message?.id || `message-${index}`
}

function extractTimelineText(message: Message): string | null {
  const typed = message as {
    type?: string
    content?: string | Array<{ type: string; text?: string }>
    message?: { content?: string | Array<{ type: string; text?: string }> }
  }

  if (typeof typed.content === 'string') return typed.content.trim() || null
  if (Array.isArray(typed.content)) return getContentText(typed.content) || null

  const nestedContent = typed.message?.content
  if (typeof nestedContent === 'string') return nestedContent.trim() || null
  if (Array.isArray(nestedContent)) {
    return getContentText(nestedContent) || null
  }
  return null
}

function getProviderLabel(): string | undefined {
  const appliedProfileId = process.env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID
  if (appliedProfileId) {
    const appliedProfile = getProviderProfiles().find(
      profile => profile.id === appliedProfileId,
    )
    if (appliedProfile) {
      return appliedProfile.name || appliedProfile.provider
    }
  }

  const activeProfile = getActiveProviderProfile()
  if (activeProfile) {
    return activeProfile.name || activeProfile.provider
  }

  if (process.env.OPENAI_BASE_URL?.trim()) {
    return process.env.OPENAI_BASE_URL.trim()
  }

  return undefined
}

export function useMobileServer({
  isLoading,
  messages,
  onSubmitMessage,
  onAbortCurrent,
}: Props): void {
  const { addNotification } = useNotifications()
  const setAppState = useSetAppState()
  const enabled = useAppState(s => s.mobileServerEnabled ?? false)
  const host = useAppState(s => s.mobileServerHost || '127.0.0.1')
  const port = useAppState(s => s.mobileServerPort || 4097)
  const token = useAppState(s => s.mobileServerToken)
  const tailscaleHost = useAppState(s => s.mobileServerTailscaleHost)
  const workspace = useAppState(s => s.mobileServerWorkspaceDir || process.cwd())
  const configVersion = useAppState(s => s.mobileServerConfigVersion ?? 0)
  const currentModel = useAppState(
    s => s.mainLoopModelForSession ?? s.mainLoopModel,
  )
  const activeLocalOverlayKind = useAppState(s => s.activeLocalOverlayKind)
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)

  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const onSubmitMessageRef = useRef(onSubmitMessage)
  onSubmitMessageRef.current = onSubmitMessage
  const onAbortCurrentRef = useRef(onAbortCurrent)
  onAbortCurrentRef.current = onAbortCurrent
  const activeRunRef = useRef<ActiveMobileRun | null>(null)
  const runSequenceRef = useRef(0)
  const lastResponseRef = useRef<string | null>(null)
  const activeLocalOverlayKindRef = useRef(activeLocalOverlayKind)
  activeLocalOverlayKindRef.current = activeLocalOverlayKind
  const toolPermissionContextRef = useRef(toolPermissionContext)
  toolPermissionContextRef.current = toolPermissionContext
  const modelLabelRef = useRef(
    currentModel ? renderDefaultModelSetting(currentModel) : 'unknown',
  )
  modelLabelRef.current = currentModel
    ? renderDefaultModelSetting(currentModel)
    : 'unknown'

  useEffect(() => {
    const active = activeRunRef.current
    if (!active || isLoading) return

    const tail = messagesRef.current.slice(active.baselineCount)
    const lastVisible = [...tail]
      .reverse()
      .map(extractVisibleMessageText)
      .find(Boolean)

    if (lastVisible) {
      lastResponseRef.current = lastVisible
    }
    activeRunRef.current = null
  }, [isLoading, messages])

  useEffect(() => {
    if (!enabled) {
      setAppState(prev =>
        prev.mobileServerConnected || prev.mobileServerError
          ? {
              ...prev,
              mobileServerConnected: false,
              mobileServerError: undefined,
              mobileServerUrl: undefined,
              mobileServerTailscaleUrl: undefined,
            }
          : prev,
      )
      return
    }

    if (!token) {
      setAppState(prev => ({
        ...prev,
        mobileServerConnected: false,
        mobileServerEnabled: false,
        mobileServerError: 'Missing mobile server token. Run /server again.',
      }))
      return
    }

    let cancelled = false
    let handle: MobileServerHandle | null = null

    const submitPrompt = (prompt: string): MobileServerSubmitResult => {
      const trimmedPrompt = prompt.trim()
      if (trimmedPrompt === '/dismiss') {
        setAppState(prev => ({
          ...prev,
          dismissLocalOverlayRequestNonce:
            (prev.dismissLocalOverlayRequestNonce ?? 0) + 1,
        }))
        return { ok: true }
      }
      if (isPermissionsYoloCommand(trimmedPrompt)) {
        const result = enableYoloPermissionMode({
          getToolPermissionContext: () => toolPermissionContextRef.current,
          setToolPermissionContext: updater => {
            setAppState(prev => ({
              ...prev,
              toolPermissionContext: updater(prev.toolPermissionContext),
            }))
          },
        })
        if (!result.ok) {
          return {
            ok: false,
            status: 409,
            error: result.message,
          }
        }
        lastResponseRef.current = result.message
        return { ok: true }
      }
      if (isMobileExitCommand(trimmedPrompt)) {
        return {
          ok: false,
          status: 409,
          error: 'Exit commands are blocked from mobile to protect the terminal session.',
        }
      }
      if (trimmedPrompt.startsWith('/')) {
        return {
          ok: false,
          status: 409,
          error:
            'Mobile slash commands need native server endpoints. Use the terminal for this command for now.',
        }
      }
      if (activeRunRef.current) {
        return {
          ok: false,
          status: 409,
          error: 'Sam is already working. Use stop first.',
        }
      }
      if (isLoadingRef.current) {
        return {
          ok: false,
          status: 409,
          error: 'Sam is already working from another input. Wait for that run to finish.',
        }
      }
      if (activeLocalOverlayKindRef.current && !prompt.startsWith('/dismiss')) {
        return {
          ok: false,
          status: 409,
          error: `Local /${activeLocalOverlayKindRef.current} is open. Use Esc or /dismiss first.`,
        }
      }
      const ok = onSubmitMessageRef.current(prompt)
      if (!ok) {
        return {
          ok: false,
          status: 409,
          error: 'The live session is busy.',
        }
      }
      const runId = `mobile-${Date.now()}-${++runSequenceRef.current}`
      activeRunRef.current = {
        id: runId,
        baselineCount: messagesRef.current.length,
      }
      lastResponseRef.current = null
      return { ok: true, runId }
    }

    const start = async (): Promise<void> => {
      const startTask = mobileServerLifecycle.then(async () => {
        if (cancelled) return
        handle = await startMobileServer({
          host,
          port,
          token,
          acceptedTokens: readMobileServerTokens(),
          getSnapshot: () => ({
            state: activeRunRef.current || isLoadingRef.current ? 'busy' : 'idle',
            workspace,
            model: modelLabelRef.current,
            provider: getProviderLabel(),
            busyOwner: activeRunRef.current
              ? 'mobile'
              : isLoadingRef.current
                ? 'terminal'
                : null,
            canSubmit:
              !activeRunRef.current &&
              !isLoadingRef.current &&
              !activeLocalOverlayKindRef.current,
            canStop: !!activeRunRef.current,
            permissionMode: toolPermissionContextRef.current.mode,
            canSetYolo:
              toolPermissionContextRef.current.isBypassPermissionsModeAvailable &&
              toolPermissionContextRef.current.mode !== 'bypassPermissions',
            activeRunId: activeRunRef.current?.id ?? null,
            lastResponse: lastResponseRef.current,
            messages: extractMobileTimeline(messagesRef.current),
          }),
          submitPrompt,
          stopCurrentRun: () => {
            if (!activeRunRef.current) return false
            activeRunRef.current = null
            onAbortCurrentRef.current()
            return true
          },
        })
        if (cancelled || !handle) {
          const serverToStop = handle
          handle = null
          await serverToStop?.stop()
          return
        }

        const localUrl = `http://127.0.0.1:${handle.port}/`
        const tailscaleUrl = buildTailscaleUrl(handle.port, tailscaleHost)
        const phoneMode = host !== '127.0.0.1'
        setAppState(prev => ({
          ...prev,
          mobileServerConnected: true,
          mobileServerError: undefined,
          mobileServerPort: handle?.port ?? port,
          mobileServerUrl: localUrl,
          mobileServerTailscaleUrl: phoneMode ? tailscaleUrl : undefined,
          mobileServerStartedAt: Date.now(),
        }))
        addNotification({
          key: 'mobile-server-started',
          priority: 'immediate',
          text: phoneMode
            ? `Sam mobile server ready on Tailscale: ${tailscaleUrl ?? localUrl}`
            : `Sam mobile server ready: ${localUrl}`,
        })
      })
      mobileServerLifecycle = startTask.catch(error => {
        const detail =
          error instanceof Error ? error.message : 'Failed to start mobile server'
        logForDebugging(`[mobile-server] ${detail}`, { level: 'error' })
      })

      try {
        await startTask
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Failed to start mobile server'
        logForDebugging(`[mobile-server] ${detail}`, { level: 'error' })
        setAppState(prev => ({
          ...prev,
          mobileServerConnected: false,
          mobileServerError: detail,
        }))
        addNotification({
          key: 'mobile-server-error',
          priority: 'immediate',
          text: `Mobile server failed: ${detail}`,
        })
      }
    }

    void start()

    return () => {
      cancelled = true
      const serverToStop = handle
      handle = null
      if (serverToStop) {
        mobileServerLifecycle = mobileServerLifecycle
          .then(() => serverToStop.stop())
          .catch(error => {
            const detail =
              error instanceof Error ? error.message : 'Failed to stop mobile server'
            logForDebugging(`[mobile-server] ${detail}`, { level: 'error' })
          })
        void mobileServerLifecycle
      }
      setAppState(prev =>
        prev.mobileServerConnected
          ? { ...prev, mobileServerConnected: false }
          : prev,
      )
    }
  }, [addNotification, configVersion, enabled, host, port, setAppState, tailscaleHost, token, workspace])
}

export function isMobileExitCommand(prompt: string): boolean {
  return /^(?:\/)?(?:exit|quit|q|:q|:qa|:quit)$/i.test(prompt.trim())
}

function buildTailscaleUrl(
  port: number,
  tailscaleHost?: string,
): string | undefined {
  const address = tailscaleHost?.trim() || process.env.TAILSCALE_IP?.trim()
  if (!address) return undefined
  return `http://${formatUrlHost(address)}:${port}/`
}

function formatUrlHost(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}
