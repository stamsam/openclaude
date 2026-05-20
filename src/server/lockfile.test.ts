import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  probeRunningServer,
  removeServerLock,
  writeServerLock,
  type ServerLockData,
} from './lockfile.js'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('Server Lockfile', () => {
  let testRoot: string
  let testLockDir: string
  let testLockMetadataFile: string

  beforeEach(async () => {
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaude-lock-'))
    testLockDir = path.join(testRoot, 'server.lock')
    testLockMetadataFile = path.join(testRoot, 'server.json')
    process.env.OPENCLAUDE_SERVER_LOCK_DIR = testLockDir
    process.env.OPENCLAUDE_SERVER_LOCK_METADATA_FILE = testLockMetadataFile
    await removeServerLock().catch(() => {})
  })

  afterEach(async () => {
    await removeServerLock().catch(() => {})
    delete process.env.OPENCLAUDE_SERVER_LOCK_DIR
    delete process.env.OPENCLAUDE_SERVER_LOCK_METADATA_FILE
    await fs.rm(testRoot, { force: true, recursive: true }).catch(() => {})
  })

  test('should return null when no server is running', async () => {
    const active = await probeRunningServer()
    expect(active).toBeNull()
  })

  test('should remove stale metadata when no lock exists', async () => {
    await fs.writeFile(testLockMetadataFile, '{}', 'utf8')

    expect(await probeRunningServer()).toBeNull()
    await expect(fs.stat(testLockMetadataFile)).rejects.toThrow()
  })

  test('should write and probe lock successfully', async () => {
    const data: ServerLockData = {
      pid: process.pid,
      port: 18080,
      host: '127.0.0.1',
      httpUrl: 'http://127.0.0.1:18080',
      startedAt: Date.now(),
    }

    await writeServerLock(data)

    const active = await probeRunningServer()
    expect(active).not.toBeNull()
    expect(active?.pid).toBe(process.pid)
    expect(active?.port).toBe(18080)
    expect(active?.host).toBe('127.0.0.1')
    expect(active?.httpUrl).toBe('http://127.0.0.1:18080')
  })

  test('should prevent duplicate locks', async () => {
    const data1: ServerLockData = {
      pid: process.pid,
      port: 18080,
      host: '127.0.0.1',
      httpUrl: 'http://127.0.0.1:18080',
      startedAt: Date.now(),
    }

    await writeServerLock(data1)

    const data2: ServerLockData = {
      pid: process.pid,
      port: 18081,
      host: '127.0.0.1',
      httpUrl: 'http://127.0.0.1:18081',
      startedAt: Date.now(),
    }

    await expect(writeServerLock(data2)).rejects.toThrow()
  })

  test('should cleanly remove locks', async () => {
    const data: ServerLockData = {
      pid: process.pid,
      port: 18080,
      host: '127.0.0.1',
      httpUrl: 'http://127.0.0.1:18080',
      startedAt: Date.now(),
    }

    await writeServerLock(data)
    expect(await probeRunningServer()).not.toBeNull()

    await removeServerLock()
    expect(await probeRunningServer()).toBeNull()
    await expect(fs.stat(testLockMetadataFile)).rejects.toThrow()
    await expect(fs.stat(testLockDir)).rejects.toThrow()
  })
})
