import * as React from 'react'
import { LogoPicker } from '../../components/LogoPicker.js'
import {
  DEFAULT_TERMINAL_MASCOT,
  TERMINAL_MASCOT_LABELS,
  isTerminalMascot,
  type TerminalMascot,
} from '../../utils/terminalMascot.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

type Props = {
  onDone: LocalJSXCommandOnDone
}

function LogoPickerCommand({ onDone }: Props): React.ReactElement {
  const initial = React.useMemo<TerminalMascot>(() => {
    const current = getGlobalConfig().logoMascot
    return isTerminalMascot(current) ? current : DEFAULT_TERMINAL_MASCOT
  }, [])

  const handleSelect = React.useCallback(
    (chosen: TerminalMascot) => {
      saveGlobalConfig(c => ({ ...c, logoMascot: chosen }))
      onDone(
        `Startup mascot set to ${TERMINAL_MASCOT_LABELS[chosen]}. Visible on next launch.`,
      )
    },
    [onDone],
  )

  const handleCancel = React.useCallback(() => {
    onDone('Mascot picker dismissed', { display: 'system' })
  }, [onDone])

  return (
    <LogoPicker
      initial={initial}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context) => {
  return <LogoPickerCommand onDone={onDone} />
}
