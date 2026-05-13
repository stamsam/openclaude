const SECRET_ASSIGNMENT_PATTERNS = [
  /\b(?:OPENAI|ANTHROPIC|GROQ|OPENROUTER|GEMINI|GOOGLE|TAVILY|GITHUB|GH|CODEX|OMLX|MISTRAL|MINIMAX|NVIDIA|XAI|BNKR|BANKR)_[A-Z0-9_]*(?:API_)?KEY\s*=\s*["']?[^"'\s]+["']?/gi,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|github[_-]?token)\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
]

const TOKEN_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\bgh[opsru]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{16,}\b/g,
]

export function redactSecrets(text: string | undefined | null): string {
  if (!text) return ''

  let redacted = text
  for (const pattern of SECRET_ASSIGNMENT_PATTERNS) {
    redacted = redacted.replace(pattern, match => {
      const separator = match.includes('=') ? '=' : ':'
      const key = match.slice(0, match.indexOf(separator)).trim()
      return `${key}${separator} [REDACTED]`
    })
  }
  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  return redacted
}
