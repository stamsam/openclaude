import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context) => {
  const overlayKind = context.getAppState().activeLocalOverlayKind

  if (!overlayKind) {
    onDone('Nothing to dismiss.', { display: 'system' })
    return null
  }

  context.setAppState(prev => ({
    ...prev,
    dismissLocalOverlayRequestNonce: (prev.dismissLocalOverlayRequestNonce ?? 0) + 1,
  }))

  onDone(`Dismissed /${overlayKind}.`, { display: 'system' })
  return null
}
