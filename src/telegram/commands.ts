import type { ParsedTelegramCommand } from './types.js'

const HELP_TEXT = [
  'Telegram bridge commands:',
  '/status - show bridge state',
  '/pause - block new Telegram prompts',
  '/resume - accept Telegram prompts again',
  '/stop - cancel the active Telegram-run prompt',
  '/dismiss - close the active local OpenClaude overlay only',
  '/ask <prompt> - send a normal prompt to the live session',
  '/btw <prompt> - answer a Telegram-native side question',
  '/model - show the active model',
  '/model <model> - switch models',
  '/models - show the active model',
  '/models <model> - switch models',
].join('\n')

export function getTelegramHelpText(): string {
  return HELP_TEXT
}

export function parseTelegramCommand(text: string): ParsedTelegramCommand {
  const trimmed = text.trim()
  if (!trimmed) {
    return { type: 'help' }
  }

  const normalized = trimmed.toLowerCase()
  if (
    normalized === 'what model are we using' ||
    normalized === 'what model are we on' ||
    normalized === 'what model is this'
  ) {
    return { type: 'model' }
  }

  if (!trimmed.startsWith('/')) {
    return { type: 'ask', prompt: trimmed }
  }

  const [rawCommand, ...rest] = trimmed.split(/\s+/)
  const command = rawCommand.toLowerCase()
  const remainder = rest.join(' ').trim()

  switch (command) {
    case '/status':
      return { type: 'status' }
    case '/pause':
      return { type: 'pause' }
    case '/resume':
      return { type: 'resume' }
    case '/stop':
      return { type: 'stop' }
    case '/dismiss':
    case '/esc':
    case '/cancel':
      return { type: 'dismiss' }
    case '/help':
    case '/start':
      return { type: 'help' }
    case '/approve':
      return remainder ? { type: 'approve', id: remainder } : { type: 'help' }
    case '/deny':
      return remainder ? { type: 'deny', id: remainder } : { type: 'help' }
    case '/ask':
      return remainder ? { type: 'ask', prompt: remainder } : { type: 'help' }
    case '/btw':
      return remainder ? { type: 'btw', prompt: remainder } : { type: 'help' }
    case '/model':
    case '/models':
      return remainder ? { type: 'model', model: remainder } : { type: 'model' }
    default:
      return { type: 'unknown_command', command: rawCommand }
  }
}

export function buildBtwPrompt(prompt: string): string {
  return [
    'Telegram-native /btw side question.',
    'Answer back for Telegram only.',
    'Do not affect the local OpenClaude conversation.',
    'Do not open or reference the local /btw modal.',
    'Do not edit files, run commands, or take actions.',
    'Keep the answer concise and useful on a phone.',
    '',
    `Side question: ${prompt.trim()}`,
  ].join('\n')
}
