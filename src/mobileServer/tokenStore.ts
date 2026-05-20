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

export function getMobileServerTokenStorePath(): string {
  return join(getClaudeConfigHomeDir(), TOKEN_STORE_FILE)
}

export function readMobileServerTokens(): string[] {
  return readMobileServerTokenRecords().map(device => device.token)
}

export function getOrCreateMobileServerToken(createToken: () => string): string {
  const existing = readMobileServerTokenRecords()[0]?.token
  if (existing) return existing
  return createMobileServerDeviceToken(createToken)
}

export function createMobileServerDeviceToken(createToken: () => string): string {
  const records = readMobileServerTokenRecords()
  const token = createToken()
  records.push({
    id: `device-${Date.now()}-${records.length + 1}`,
    token,
    createdAt: new Date().toISOString(),
  })
  writeMobileServerTokenRecords(records)
  return token
}

export function resetMobileServerTokens(createToken: () => string): string {
  const token = createToken()
  writeMobileServerTokenRecords([
    {
      id: `device-${Date.now()}-1`,
      token,
      createdAt: new Date().toISOString(),
    },
  ])
  return token
}

function readMobileServerTokenRecords(): DeviceTokenRecord[] {
  try {
    const raw = readFileSync(getMobileServerTokenStorePath(), 'utf8')
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

function writeMobileServerTokenRecords(devices: DeviceTokenRecord[]): void {
  const tokenPath = getMobileServerTokenStorePath()
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 })
  writeFileSync(
    tokenPath,
    `${JSON.stringify({ version: 1, devices } satisfies DeviceTokenStore, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
}
