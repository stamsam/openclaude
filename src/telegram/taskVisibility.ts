export type TelegramTaskVisibilityItem = {
  id: string
  status: string
  subject: string
  owner?: string
  blockedBy?: string[]
}

type FormatTaskVisibilityOptions = {
  heading?: string
  maxItems?: number
  unavailableReason?: string
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'killed'])
const STATUS_ORDER = new Map([
  ['in_progress', 0],
  ['running', 0],
  ['pending', 1],
  ['failed', 2],
  ['killed', 3],
  ['completed', 4],
])

export function formatTelegramTaskVisibility(
  tasks: TelegramTaskVisibilityItem[],
  options: FormatTaskVisibilityOptions = {},
): string {
  const heading = options.heading ?? 'Tasks'
  if (options.unavailableReason) {
    return `${heading}: unavailable\n${options.unavailableReason}`
  }

  if (tasks.length === 0) {
    return `${heading}: none found`
  }

  const maxItems = options.maxItems ?? 8
  const counts = countByStatus(tasks)
  const openTasks = tasks.filter(task => !TERMINAL_STATUSES.has(task.status))
  const sorted = [...openTasks].sort(compareTasks)
  const visible = sorted.slice(0, maxItems)
  const hiddenCount = Math.max(sorted.length - visible.length, 0)

  const lines = [
    `${heading}: ${openTasks.length} open / ${tasks.length} total`,
    `By status: ${formatStatusCounts(counts)}`,
  ]

  if (visible.length === 0) {
    lines.push('No open tasks.')
    return lines.join('\n')
  }

  for (const task of visible) {
    lines.push(formatTaskLine(task))
  }
  if (hiddenCount > 0) {
    lines.push(`...and ${hiddenCount} more open task${hiddenCount === 1 ? '' : 's'}.`)
  }

  return lines.join('\n')
}

function countByStatus(
  tasks: TelegramTaskVisibilityItem[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1)
  }
  return counts
}

function formatStatusCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort(([left], [right]) => compareStatus(left, right))
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')
}

function compareTasks(
  left: TelegramTaskVisibilityItem,
  right: TelegramTaskVisibilityItem,
): number {
  const statusCompare = compareStatus(left.status, right.status)
  if (statusCompare !== 0) return statusCompare

  const leftNumeric = Number(left.id)
  const rightNumeric = Number(right.id)
  if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) {
    return leftNumeric - rightNumeric
  }
  return left.id.localeCompare(right.id)
}

function compareStatus(left: string, right: string): number {
  return (
    (STATUS_ORDER.get(left) ?? 99) - (STATUS_ORDER.get(right) ?? 99) ||
    left.localeCompare(right)
  )
}

function formatTaskLine(task: TelegramTaskVisibilityItem): string {
  const parts = [
    `- #${task.id} [${task.status}] ${truncate(task.subject.trim() || 'Task', 96)}`,
  ]
  if (task.owner) {
    parts.push(`owner: ${task.owner}`)
  }
  if (task.blockedBy && task.blockedBy.length > 0) {
    parts.push(`blocked by: ${task.blockedBy.join(', ')}`)
  }
  return parts.join(' | ')
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}
