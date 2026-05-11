export const TELEGRAM_TEXT_LIMIT = 4096

export function splitTelegramMessage(
  text: string,
  limit: number = TELEGRAM_TEXT_LIMIT,
): string[] {
  const normalized = text || ''
  if (normalized.length <= limit) {
    return [normalized]
  }

  const chunks: string[] = []
  let remaining = normalized

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = remaining.lastIndexOf(' ', limit)
    }
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = limit
    }

    const chunk = remaining.slice(0, splitAt).trimEnd()
    chunks.push(chunk)
    remaining = remaining.slice(splitAt).trimStart()
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}
