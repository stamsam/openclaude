import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { lock, unlock, check } from '../utils/lockfile.js'

const DEFAULT_LOCK_DIR = path.join(os.tmpdir(), 'openclaude-server.lock')
const DEFAULT_LOCK_METADATA_FILE = path.join(
  os.tmpdir(),
  'openclaude-server.json',
)
const LOCK_STALE_MS = 30_000
const LOCK_UPDATE_MS = 5_000

let activeRelease: (() => Promise<void>) | null = null

export interface ServerLockData {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

function lockDir(): string {
  return process.env.OPENCLAUDE_SERVER_LOCK_DIR ?? DEFAULT_LOCK_DIR
}

function lockMetadataFile(): string {
  return (
    process.env.OPENCLAUDE_SERVER_LOCK_METADATA_FILE ??
    DEFAULT_LOCK_METADATA_FILE
  )
}

function unknownLockData(): ServerLockData {
  return {
    pid: 0,
    port: 0,
    host: 'unknown',
    httpUrl: 'unknown',
    startedAt: 0,
  }
}

function isServerLockData(value: unknown): value is ServerLockData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const data = value as Partial<ServerLockData>
  return (
    typeof data.pid === 'number' &&
    Number.isInteger(data.pid) &&
    data.pid >= 0 &&
    typeof data.port === 'number' &&
    Number.isInteger(data.port) &&
    data.port >= 0 &&
    typeof data.host === 'string' &&
    typeof data.httpUrl === 'string' &&
    typeof data.startedAt === 'number'
  )
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) {
    return true
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function cleanupMetadata(): Promise<void> {
  await fs.unlink(lockMetadataFile()).catch(() => {})
}

async function writeMetadataAtomic(data: ServerLockData): Promise<void> {
  const file = lockMetadataFile()
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
  await fs.rename(tmp, file).catch(async err => {
    await fs.unlink(tmp).catch(() => {})
    throw err
  })
}

export async function probeRunningServer(): Promise<ServerLockData | null> {
  try {
    const isLocked = await check(lockDir(), { stale: LOCK_STALE_MS })
    if (!isLocked) {
      await cleanupMetadata()
      return null
    }

    const content = await fs.readFile(lockMetadataFile(), 'utf8').catch(() => {
      return null
    })
    if (!content) {
      return unknownLockData()
    }

    let raw: unknown
    try {
      raw = JSON.parse(content) as unknown
    } catch {
      return unknownLockData()
    }
    if (!isServerLockData(raw)) {
      return unknownLockData()
    }

    if (!isProcessAlive(raw.pid)) {
      await cleanupMetadata()
      return null
    }

    return raw
  } catch {
    await cleanupMetadata()
    return null
  }
}

export async function writeServerLock(data: ServerLockData): Promise<void> {
  if (activeRelease) {
    throw new Error('This OpenClaude process already holds the server lock')
  }

  const dir = lockDir()
  let release: (() => Promise<void>) | null = null

  try {
    await fs.mkdir(dir, { recursive: true })
    release = await lock(dir, {
      stale: LOCK_STALE_MS,
      update: LOCK_UPDATE_MS,
      retries: 0,
    })
    await writeMetadataAtomic(data)
    activeRelease = release
  } catch (err) {
    if (release) {
      await release().catch(() => {})
    }
    throw new Error(
      `Failed to acquire OpenClaude server lock: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

export async function removeServerLock(): Promise<void> {
  const canRemoveLockDir =
    activeRelease !== null || process.env.OPENCLAUDE_SERVER_LOCK_DIR !== undefined

  try {
    if (activeRelease) {
      await activeRelease()
      activeRelease = null
    } else {
      await unlock(lockDir()).catch(() => {})
    }
  } catch {}

  await cleanupMetadata()
  if (canRemoveLockDir) {
    await fs.rm(lockDir(), { force: true, recursive: true }).catch(() => {})
  }
}

export async function acquireServerLock(port: number): Promise<() => Promise<void>> {
  const portLockDir = path.join(os.tmpdir(), `openclaude-server-${port}.lock`)

  try {
    await fs.mkdir(portLockDir, { recursive: true })
    return await lock(portLockDir, {
      stale: LOCK_STALE_MS,
      update: LOCK_UPDATE_MS,
      retries: 0,
    })
  } catch {
    throw new Error(`Another OpenClaude server is already running on port ${port}`)
  }
}
