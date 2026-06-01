import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

const TOKEN_STORE_FILE = 'mobile-server-devices.json'
const TOKEN_PATTERN = /^sam-[A-Za-z0-9_-]{16,}$/

type DeviceTokenRecord = {
  id: string
  token: string
  createdAt: string
}

type DeviceTokenStore = {
  version: 1
  devices: DeviceTokenRecord[]
}

type TokenStoreOptions = {
  storePath?: string
}

export function getMobileServerTokenStorePath(): string {
  return join(getClaudeConfigHomeDir(), TOKEN_STORE_FILE)
}

export function readMobileServerTokens(options?: TokenStoreOptions): string[] {
  return readMobileServerTokenRecords(options).map(device => device.token)
}

export function getOrCreateMobileServerToken(
  createToken: () => string,
  options?: TokenStoreOptions,
): string {
  const existing = readMobileServerTokenRecords(options)[0]?.token
  if (existing) return existing
  return createMobileServerDeviceToken(createToken, options)
}

export function createMobileServerDeviceToken(
  createToken: () => string,
  options?: TokenStoreOptions,
): string {
  const records = readMobileServerTokenRecords(options)
  const token = createToken()
  records.push({
    id: `device-${Date.now()}-${records.length + 1}`,
    token,
    createdAt: new Date().toISOString(),
  })
  writeMobileServerTokenRecords(records, options)
  return token
}

export function resetMobileServerTokens(
  createToken: () => string,
  options?: TokenStoreOptions,
): string {
  const token = createToken()
  writeMobileServerTokenRecords(
    [
      {
        id: `device-${Date.now()}-1`,
        token,
        createdAt: new Date().toISOString(),
      },
    ],
    options,
  )
  return token
}

function readMobileServerTokenRecords(
  options?: TokenStoreOptions,
): DeviceTokenRecord[] {
  try {
    const raw = readFileSync(
      options?.storePath ?? getMobileServerTokenStorePath(),
      'utf8',
    )
    const parsed = JSON.parse(raw) as Partial<DeviceTokenStore>
    if (!Array.isArray(parsed.devices)) return []
    return parsed.devices.filter(
      (device): device is DeviceTokenRecord =>
        typeof device?.id === 'string' &&
        typeof device.createdAt === 'string' &&
        typeof device.token === 'string' &&
        TOKEN_PATTERN.test(device.token),
    )
  } catch {
    return []
  }
}

function writeMobileServerTokenRecords(
  devices: DeviceTokenRecord[],
  options?: TokenStoreOptions,
): void {
  const tokenPath = options?.storePath ?? getMobileServerTokenStorePath()
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 })
  writeFileSync(
    tokenPath,
    `${JSON.stringify({ version: 1, devices } satisfies DeviceTokenStore, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
}
