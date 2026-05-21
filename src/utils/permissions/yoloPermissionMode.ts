import type { ToolPermissionContext } from '../../Tool.js'
import { transitionPermissionMode } from './permissionSetup.js'
import { getLeaderToolUseConfirmQueue } from '../swarm/leaderPermissionBridge.js'

export type YoloPermissionModeResult =
  | { ok: true; changed: boolean; message: string }
  | { ok: false; message: string }

export type YoloPermissionModeContext = {
  getToolPermissionContext: () => ToolPermissionContext
  setToolPermissionContext: (
    updater: (current: ToolPermissionContext) => ToolPermissionContext,
  ) => void
}

export function isPermissionsYoloCommand(prompt: string): boolean {
  return /^\/?(?:permissions|allowed-tools)\s+yolo$/i.test(prompt.trim())
}

export function enableYoloPermissionMode(
  context: YoloPermissionModeContext,
): YoloPermissionModeResult {
  const current = context.getToolPermissionContext()

  if (current.mode === 'bypassPermissions') {
    return {
      ok: true,
      changed: false,
      message: 'Permissions are already in yolo mode.',
    }
  }

  if (!current.isBypassPermissionsModeAvailable) {
    return {
      ok: false,
      message:
        'Yolo permissions are disabled. Restart with --allow-dangerously-skip-permissions or enable permissions.allowBypassPermissionsMode in settings.json.',
    }
  }

  try {
    context.setToolPermissionContext(previous => {
      if (previous.mode === 'bypassPermissions') return previous
      const transitioned = transitionPermissionMode(
        previous.mode,
        'bypassPermissions',
        previous,
      )
      return {
        ...transitioned,
        mode: 'bypassPermissions',
      }
    })
    recheckLeaderPermissionQueue()
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to switch permissions to yolo mode.',
    }
  }

  return {
    ok: true,
    changed: true,
    message:
      'Permissions set to yolo mode for this session. Pending prompts were rechecked.',
  }
}

export function recheckLeaderPermissionQueue(): void {
  setImmediate(() => {
    getLeaderToolUseConfirmQueue()?.(currentQueue => {
      currentQueue.forEach(item => {
        void item.recheckPermission()
      })
      return currentQueue
    })
  })
}
