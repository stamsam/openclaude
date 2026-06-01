import { feature } from 'bun:bundle'
import * as React from 'react'
import { Box, Text } from 'src/ink.js'
import { getPlatform } from 'src/utils/platform.js'
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js'
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isFastModeAvailable, isFastModeEnabled } from '../../utils/fastMode.js'
import { getNewlineInstructions } from './utils.js'

/** Format a shortcut for display in the help menu (e.g., "ctrl+o" -> "ctrl + o") */
function formatShortcut(shortcut: string): string {
  return shortcut.replace(/\+/g, ' + ')
}

type Props = {
  dimColor?: boolean
  fixedWidth?: boolean
  gap?: number
  paddingX?: number
}

function HelpLine({
  children,
  dimColor,
}: {
  children: React.ReactNode
  dimColor?: boolean
}): React.ReactElement {
  return (
    <Box>
      <Text dimColor={dimColor}>{children}</Text>
    </Box>
  )
}

export function PromptInputHelpMenu({
  dimColor,
  fixedWidth,
  gap,
  paddingX,
}: Props): React.ReactElement {
  const transcriptShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o'),
  )
  const todosShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTodos', 'Global', 'ctrl+t'),
  )
  const undoShortcut = formatShortcut(
    useShortcutDisplay('chat:undo', 'Chat', 'ctrl+_'),
  )
  const stashShortcut = formatShortcut(
    useShortcutDisplay('chat:stash', 'Chat', 'ctrl+s'),
  )
  const cycleModeShortcut = formatShortcut(
    useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab'),
  )
  const modelPickerShortcut = formatShortcut(
    useShortcutDisplay('chat:modelPicker', 'Chat', 'alt+p'),
  )
  const fastModeShortcut = formatShortcut(
    useShortcutDisplay('chat:fastMode', 'Chat', 'alt+o'),
  )
  const externalEditorShortcut = formatShortcut(
    useShortcutDisplay('chat:externalEditor', 'Chat', 'ctrl+g'),
  )
  const terminalShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTerminal', 'Global', 'meta+j'),
  )
  const imagePasteShortcut = formatShortcut(
    useShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v'),
  )
  const showTerminalShortcut =
    feature('TERMINAL_PANEL') &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_panel', false)

  return (
    <Box paddingX={paddingX} flexDirection="row" gap={gap}>
      <Box flexDirection="column" width={fixedWidth ? 25 : undefined}>
        <HelpLine dimColor={dimColor}>! for bash mode</HelpLine>
        <HelpLine dimColor={dimColor}>/ for commands</HelpLine>
        <HelpLine dimColor={dimColor}>@ for file paths</HelpLine>
        <HelpLine dimColor={dimColor}>/bg for background session</HelpLine>
        <HelpLine dimColor={dimColor}>← for Agent View</HelpLine>
        <HelpLine dimColor={dimColor}>/btw for side question</HelpLine>
      </Box>
      <Box flexDirection="column" width={fixedWidth ? 35 : undefined}>
        <HelpLine dimColor={dimColor}>double tap esc to clear input</HelpLine>
        <HelpLine dimColor={dimColor}>
          {cycleModeShortcut} to auto-accept edits
        </HelpLine>
        <HelpLine dimColor={dimColor}>
          {transcriptShortcut} for verbose output
        </HelpLine>
        <HelpLine dimColor={dimColor}>{todosShortcut} to toggle tasks</HelpLine>
        {showTerminalShortcut ? (
          <HelpLine dimColor={dimColor}>{terminalShortcut} for terminal</HelpLine>
        ) : null}
        <HelpLine dimColor={dimColor}>{getNewlineInstructions()}</HelpLine>
      </Box>
      <Box flexDirection="column">
        <HelpLine dimColor={dimColor}>{undoShortcut} to undo</HelpLine>
        {getPlatform() !== 'windows' ? (
          <HelpLine dimColor={dimColor}>ctrl + z to suspend</HelpLine>
        ) : null}
        <HelpLine dimColor={dimColor}>
          {imagePasteShortcut} to paste images
        </HelpLine>
        <HelpLine dimColor={dimColor}>
          {modelPickerShortcut} to switch model
        </HelpLine>
        {isFastModeEnabled() && isFastModeAvailable() ? (
          <HelpLine dimColor={dimColor}>
            {fastModeShortcut} to toggle fast mode
          </HelpLine>
        ) : null}
        <HelpLine dimColor={dimColor}>{stashShortcut} to stash prompt</HelpLine>
        <HelpLine dimColor={dimColor}>
          {externalEditorShortcut} to edit in $EDITOR
        </HelpLine>
        <HelpLine dimColor={dimColor}>/tui for flicker-free renderer</HelpLine>
        <HelpLine dimColor={dimColor}>/logo for mascot</HelpLine>
        {isKeybindingCustomizationEnabled() ? (
          <HelpLine dimColor={dimColor}>/keybindings to customize</HelpLine>
        ) : null}
      </Box>
    </Box>
  )
}
