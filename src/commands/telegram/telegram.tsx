import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import TextInput from '../../components/TextInput.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { saveTelegramSettings } from '../../telegram/settings.js'
import { validateWorkspaceDir } from '../../telegram/workspace.js'
import {
  buildTelegramSessionStatus,
  canEnableTelegramFromEnv,
  getTelegramWorkspaceForSession,
  type TelegramSlashAction,
  parseTelegramSlashArgs,
} from './helpers.js'

type Props = {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  args: string
}

type SetupStep = 'token' | 'user' | 'workspace' | 'review'

function getSessionWorkspace(context: LocalJSXCommandContext, cwd: string): string {
  const override = context.getAppState().telegramBridgeWorkspaceDir
  if (override) return override
  return getTelegramWorkspaceForSession(cwd)
}

function TelegramSetupWizard({
  onDone,
  context,
  cwd,
}: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  cwd: string
}): React.ReactNode {
  const columns = useTerminalSize().columns
  const initialWorkspace = useMemo(() => getSessionWorkspace(context, cwd), [context, cwd])
  const [step, setStep] = useState<SetupStep>('token')
  const [botToken, setBotToken] = useState(
    process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
  )
  const [allowedUserId, setAllowedUserId] = useState(
    process.env.TELEGRAM_ALLOWED_USER_ID?.trim() || '',
  )
  const [workspaceDir, setWorkspaceDir] = useState(initialWorkspace)
  const [error, setError] = useState<string | null>(null)
  const [tokenCursorOffset, setTokenCursorOffset] = useState(botToken.length)
  const [userCursorOffset, setUserCursorOffset] = useState(allowedUserId.length)
  const [workspaceCursorOffset, setWorkspaceCursorOffset] = useState(
    workspaceDir.length,
  )

  const handleCancel = useCallback(() => {
    onDone('Telegram setup cancelled.', { display: 'system' })
  }, [onDone])

  const handleBack = useCallback(() => {
    setError(null)
    setStep(current => {
      switch (current) {
        case 'user':
          return 'token'
        case 'workspace':
          return 'user'
        case 'review':
          return 'workspace'
        default:
          return current
      }
    })
  }, [])

  const goToUser = useCallback(() => {
    if (!botToken.trim()) {
      setError('Enter the Telegram bot token from BotFather.')
      return
    }
    setError(null)
    setStep('user')
  }, [botToken])

  const goToWorkspace = useCallback(() => {
    if (!allowedUserId.trim()) {
      setError('Enter your numeric Telegram user ID.')
      return
    }
    if (!/^-?\d+$/.test(allowedUserId.trim())) {
      setError('Telegram user ID should be numeric.')
      return
    }
    setError(null)
    setStep('workspace')
  }, [allowedUserId])

  const goToReview = useCallback(() => {
    try {
      const validated = validateWorkspaceDir(workspaceDir)
      setWorkspaceDir(validated)
      setWorkspaceCursorOffset(validated.length)
      setError(null)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace path is invalid.')
    }
  }, [workspaceDir])

  const handleSave = useCallback(() => {
    try {
      const validatedWorkspace = validateWorkspaceDir(workspaceDir)
      saveTelegramSettings({
        botToken,
        allowedUserId,
      })
      context.setAppState(prev => ({
        ...prev,
        telegramBridgeEnabled: true,
        telegramBridgePaused: false,
        telegramBridgeError: undefined,
        telegramBridgeWorkspaceDir: validatedWorkspace,
      }))
      context.addNotification?.({
        key: 'telegram-setup-complete',
        priority: 'immediate',
        text: 'Telegram setup complete. Bridge enabled for this session.',
      })
      onDone(
        [
          'Telegram setup complete.',
          '',
          'Saved globally:',
          '- bot token',
          '- allowed user ID',
          '',
          `Workspace for this session: ${validatedWorkspace}`,
          '',
          'Telegram is now enabled for this session.',
        ].join('\n'),
        { display: 'system' },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Telegram setup.')
      setStep('workspace')
    }
  }, [allowedUserId, botToken, context, onDone, workspaceDir])

  useKeybindings(
    {
      'confirm:previous': handleBack,
      'confirm:yes': handleSave,
    },
    {
      context: 'Confirmation',
      isActive: step === 'review',
    },
  )

  useKeybindings(
    {
      'confirm:previous': handleBack,
    },
    {
      context: 'Confirmation',
      isActive: step !== 'token' && step !== 'review',
    },
  )

  let subtitle = 'Step 1 of 4: Create a bot'
  let body: React.ReactNode = null

  if (step === 'token') {
    subtitle = 'Step 1 of 4: Create a bot'
    body = (
      <Box flexDirection="column" gap={1}>
        <Text>
          1. Open Telegram and message @BotFather
        </Text>
        <Text>
          2. Run /newbot and create the bot
        </Text>
        <Text>
          3. Paste the bot token below
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={botToken}
            onChange={value => {
              setBotToken(value)
              setError(null)
            }}
            onSubmit={goToUser}
            mask="*"
            focus
            showCursor
            placeholder="123456789:abcdef..."
            columns={columns}
            cursorOffset={tokenCursorOffset}
            onChangeCursorOffset={setTokenCursorOffset}
          />
        </Box>
      </Box>
    )
  } else if (step === 'user') {
    subtitle = 'Step 2 of 4: Allow your Telegram account'
    body = (
      <Box flexDirection="column" gap={1}>
        <Text>
          Paste your numeric Telegram user ID.
        </Text>
        <Text dimColor>
          If you do not know it, message a bot like @userinfobot or use your existing Telegram workflow for retrieving your numeric ID.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={allowedUserId}
            onChange={value => {
              setAllowedUserId(value)
              setError(null)
            }}
            onSubmit={goToWorkspace}
            focus
            showCursor
            placeholder="123456789"
            columns={columns}
            cursorOffset={userCursorOffset}
            onChangeCursorOffset={setUserCursorOffset}
          />
        </Box>
      </Box>
    )
  } else if (step === 'workspace') {
    subtitle = 'Step 3 of 4: Confirm this session workspace'
    body = (
      <Box flexDirection="column" gap={1}>
        <Text>
          Telegram should use the directory this OpenClaude session was opened in by default.
        </Text>
        <Text dimColor>
          You can just press Enter, or edit it for this session.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={workspaceDir}
            onChange={value => {
              setWorkspaceDir(value)
              setError(null)
            }}
            onSubmit={goToReview}
            focus
            showCursor
            columns={columns}
            cursorOffset={workspaceCursorOffset}
            onChangeCursorOffset={setWorkspaceCursorOffset}
          />
        </Box>
      </Box>
    )
  } else {
    subtitle = 'Step 4 of 4: Save and enable Telegram'
    body = (
      <Box flexDirection="column" gap={1}>
        <Text>Review the setup:</Text>
        <Text>Bot token: saved locally</Text>
        <Text>Allowed user ID: {allowedUserId.trim()}</Text>
        <Text>Workspace for this session: {workspaceDir}</Text>
        <Text dimColor>
          Press Enter to save the global bot settings and turn Telegram on for this session.
        </Text>
      </Box>
    )
  }

  return (
    <Dialog
      title="Telegram setup"
      subtitle={subtitle}
      onCancel={handleCancel}
      inputGuide={() => (
        <Text>
          {step === 'review'
            ? 'Enter to save and enable · Esc to cancel'
            : 'Enter to continue · Esc to cancel'}
        </Text>
      )}
    >
      <Box flexDirection="column" gap={1}>
        {body}
        {step !== 'token' ? (
          <Text dimColor>Use Shift+Tab or your back binding to go to the previous step.</Text>
        ) : null}
        {error ? <Text color="warning">{error}</Text> : null}
      </Box>
    </Dialog>
  )
}

function TelegramImmediateAction({
  onDone,
  context,
  action,
  workspace,
}: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  action: TelegramSlashAction
  workspace: string
}): React.ReactNode {
  useEffect(() => {
    const appState = context.getAppState()
    const statusText = buildTelegramSessionStatus({
      enabled: appState.telegramBridgeEnabled ?? false,
      connected: appState.telegramBridgeConnected ?? false,
      paused: appState.telegramBridgePaused ?? false,
      workspace,
      error: appState.telegramBridgeError,
    })

    if (action.kind === 'status') {
      onDone(statusText, { display: 'system' })
      return
    }

    if (action.kind === 'help') {
      onDone(
        [
          'Usage: /telegram [on|off|status|setup]',
          '',
          '/telegram toggles Telegram access for this live session.',
          '/telegram setup opens a guided setup flow inside OpenClaude.',
        ].join('\n'),
        { display: 'system' },
      )
      return
    }

    const nextEnabled =
      action.kind === 'off'
        ? false
        : action.kind === 'on'
          ? true
          : !(appState.telegramBridgeEnabled ?? false)
    const nextStatusText = buildTelegramSessionStatus({
      enabled: nextEnabled,
      connected: nextEnabled ? appState.telegramBridgeConnected ?? false : false,
      paused: nextEnabled ? false : appState.telegramBridgePaused ?? false,
      workspace,
      error: nextEnabled ? undefined : appState.telegramBridgeError,
    })

    context.setAppState(prev => ({
      ...prev,
      telegramBridgeEnabled: nextEnabled,
      telegramBridgePaused: nextEnabled ? false : prev.telegramBridgePaused,
      telegramBridgeError: undefined,
      telegramBridgeWorkspaceDir: nextEnabled
        ? prev.telegramBridgeWorkspaceDir || workspace
        : prev.telegramBridgeWorkspaceDir,
    }))

    context.addNotification?.({
      key: 'telegram-bridge-toggle',
      priority: 'immediate',
      text: nextEnabled
        ? 'Telegram bridge enabled for this session'
        : 'Telegram bridge disabled for this session',
    })

    onDone(
      nextEnabled
        ? `Telegram bridge turning on for this session.\n${nextStatusText}`
        : 'Telegram bridge turned off for this session.',
      { display: 'system' },
    )
  }, [action, context, onDone, workspace])

  return null
}

function TelegramCommand({ onDone, context, args }: Props): React.ReactNode {
  const action = parseTelegramSlashArgs(args)
  const cwd = getCwd()
  const appState = context.getAppState()
  const workspace = getSessionWorkspace(context, cwd)

  if (action.kind === 'setup') {
    return <TelegramSetupWizard onDone={onDone} context={context} cwd={cwd} />
  }

  const wantsEnable =
    action.kind === 'on' ||
    (action.kind === 'toggle' && !(appState.telegramBridgeEnabled ?? false))

  if (wantsEnable && !canEnableTelegramFromEnv()) {
    return <TelegramSetupWizard onDone={onDone} context={context} cwd={cwd} />
  }
  return (
    <TelegramImmediateAction
      onDone={onDone}
      context={context}
      action={action}
      workspace={workspace}
    />
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  return <TelegramCommand onDone={onDone} context={context} args={args} />
}
