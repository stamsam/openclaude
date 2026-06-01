import chalk from 'chalk'
import type { ExitReason } from 'src/entrypoints/agentSdkTypes.js'
import { formatDuration } from './format.js'

export type ExitSummaryStats = {
  sessionId: string
  resumeCommand?: string
  wallDurationMs: number
  apiDurationMs: number
  toolDurationMs: number
  toolCallCount: number
  toolFailureCount: number
  inputTokens?: number
  outputTokens?: number
  estimatedOutputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

const MIN_WIDTH = 40
const MAX_WIDTH = 82
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g

function visibleLength(value: string): number {
  return value.replace(ANSI_PATTERN, '').length
}

function padAnsiEnd(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - visibleLength(value)))
}

function clampWidth(columns: number | undefined): number {
  const available = Math.max(24, (columns ?? 80) - 2)
  return Math.min(MAX_WIDTH, available)
}

function boxLine(content: string, width: number): string {
  return `${chalk.dim('│')} ${padAnsiEnd(content, width - 4)} ${chalk.dim('│')}`
}

function blankLine(width: number): string {
  return boxLine('', width)
}

function wrapWords(value: string, width: number): string[] {
  if (value.length <= width) {
    return [value]
  }

  const lines: string[] = []
  let current = ''
  for (const word of value.split(/\s+/)) {
    if (!word) continue
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width))
      }
      continue
    }
    const next = current ? `${current} ${word}` : word
    if (next.length > width) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines.length > 0 ? lines : ['']
}

function row(
  label: string,
  value: string,
  width: number,
  valueColor: (text: string) => string = chalk.dim,
): string[] {
  const innerWidth = width - 4
  const labelWidth = Math.min(19, Math.max(12, Math.floor(innerWidth * 0.4)))
  const valueWidth = Math.max(12, width - 4 - labelWidth)
  const wrapped = wrapWords(value, valueWidth)
  return wrapped.map((line, index) =>
    boxLine(
      `${index === 0 ? chalk.cyan(label.padEnd(labelWidth)) : ' '.repeat(labelWidth)}${valueColor(line)}`,
      width,
    ),
  )
}

function section(title: string, width: number): string {
  return boxLine(chalk.bold.dim(title), width)
}

function pct(success: number, total: number): string {
  if (total === 0) {
    return '0.0%'
  }
  return `${((success / total) * 100).toFixed(1)}%`
}

function exitVerb(reason: ExitReason): string {
  return reason === 'logout' ? 'signed out' : 'powering down'
}

function formatTokens(value: number | undefined): string {
  return Math.max(0, value ?? 0).toLocaleString('en-US')
}

function formatMaybeEstimatedTokens(value: number, estimated: boolean): string {
  return `${estimated ? '~' : ''}${formatTokens(value)}`
}

export function formatExitSummary(
  stats: ExitSummaryStats,
  options: { columns?: number; reason?: ExitReason } = {},
): string {
  const width = clampWidth(options.columns)
  const top = `${chalk.dim('┌')}${chalk.dim('─'.repeat(width - 2))}${chalk.dim('┐')}`
  const bottom = `${chalk.dim('└')}${chalk.dim('─'.repeat(width - 2))}${chalk.dim('┘')}`
  const toolCallCount = Math.max(0, stats.toolCallCount)
  const toolFailureCount = Math.min(
    toolCallCount,
    Math.max(0, stats.toolFailureCount),
  )
  const successCount = toolCallCount - toolFailureCount
  const activeMs = stats.apiDurationMs + stats.toolDurationMs
  const successRate = pct(successCount, toolCallCount)
  const inputTokens = Math.max(0, stats.inputTokens ?? 0)
  const reportedOutputTokens = Math.max(0, stats.outputTokens ?? 0)
  const estimatedOutputTokens = Math.max(0, stats.estimatedOutputTokens ?? 0)
  const outputTokens =
    reportedOutputTokens > 0 ? reportedOutputTokens : estimatedOutputTokens
  const hasEstimatedOutput = reportedOutputTokens === 0 && estimatedOutputTokens > 0
  const totalTokens = inputTokens + outputTokens
  const successRateColor = toolCallCount === 0
    ? chalk.redBright
    : toolFailureCount === 0
      ? chalk.greenBright
      : chalk.yellowBright

  const lines: string[] = [
    top,
    blankLine(width),
    boxLine(
      `${chalk.magentaBright('Agent')} ${chalk.magenta(exitVerb(options.reason ?? 'other'))}. ${chalk.cyanBright('Goodbye!')}`,
      width,
    ),
    blankLine(width),
    section('Interaction Summary', width),
    ...row('Session ID:', stats.sessionId, width, chalk.dim),
    ...row(
      'Tool Calls:',
      `${toolCallCount} ( ${chalk.greenBright('✓')} ${successCount} ${chalk.redBright('×')} ${toolFailureCount} )`,
      width,
      text => text,
    ),
    ...row('Success Rate:', successRate, width, successRateColor),
    ...row(
      'Tokens:',
      `${formatMaybeEstimatedTokens(totalTokens, hasEstimatedOutput)} total ( ${formatTokens(inputTokens)} in · ${formatMaybeEstimatedTokens(outputTokens, hasEstimatedOutput)} out )`,
      width,
      chalk.yellowBright,
    ),
    ...row(
      'Cache Tokens:',
      `${formatTokens(stats.cacheReadInputTokens)} read · ${formatTokens(stats.cacheCreationInputTokens)} write`,
      width,
      chalk.dim,
    ),
    blankLine(width),
    section('Performance', width),
    ...row('Wall Time:', formatDuration(stats.wallDurationMs), width),
    ...row('» API Time:', formatDuration(stats.apiDurationMs), width),
    ...row('» Tool Time:', formatDuration(stats.toolDurationMs), width),
    ...row('Agent Active:', formatDuration(activeMs), width),
  ]

  if (stats.resumeCommand) {
    lines.push(blankLine(width))
    lines.push(...row('To resume:', stats.resumeCommand, width, chalk.cyanBright))
  }

  lines.push(blankLine(width), bottom)
  return lines.join('\n')
}
