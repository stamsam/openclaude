export type SavedTelegramSettings = {
  botToken: string
  allowedUserId: string
}

function getConfigApi(): typeof import('../utils/config.js') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../utils/config.js') as typeof import('../utils/config.js')
}

export function getSavedTelegramSettings():
  | Partial<SavedTelegramSettings>
  | undefined {
  return getConfigApi().getGlobalConfig().telegramBridgeConfig
}

export function hasSavedTelegramSettings(): boolean {
  const saved = getSavedTelegramSettings()
  return Boolean(
    saved?.botToken?.trim() &&
      saved?.allowedUserId?.trim(),
  )
}

export function saveTelegramSettings(settings: SavedTelegramSettings): void {
  const normalized: SavedTelegramSettings = {
    botToken: settings.botToken.trim(),
    allowedUserId: settings.allowedUserId.trim(),
  }

  getConfigApi().saveGlobalConfig(current => ({
    ...current,
    telegramBridgeConfig: normalized,
  }))
}

export function resolveTelegramSetting(
  envValue: string | undefined,
  savedValue: string | undefined,
): string | undefined {
  const envTrimmed = envValue?.trim()
  if (envTrimmed) return envTrimmed
  const savedTrimmed = savedValue?.trim()
  if (savedTrimmed) return savedTrimmed
  return undefined
}
