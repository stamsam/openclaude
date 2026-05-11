export function redactLearningText(input: unknown): string {
  return String(input ?? '')
    .replace(/sk-[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(
      /([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))[=:]\s*[^\s\n'"`]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s\n'"`]+/gi, '$1[REDACTED]')
}

export function looksSensitive(input: unknown): boolean {
  const text = String(input ?? '')
  return /(sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]+|PASSWORD|SECRET|TOKEN|API[_ -]?KEY)/i.test(
    text,
  )
}
