import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { listAllCronTasks, removeCronTasks } from '../../utils/cronTasks.js'
import { call } from './cron.js'

const ORIGINAL_DISABLE_CRON = process.env.CLAUDE_CODE_DISABLE_CRON

async function clearCronJobs() {
  const tasks = await listAllCronTasks()
  await removeCronTasks(tasks.map(task => task.id))
}

describe('/cron command', () => {
  beforeEach(async () => {
    delete process.env.CLAUDE_CODE_DISABLE_CRON
    await clearCronJobs()
  })

  afterEach(async () => {
    await clearCronJobs()
    if (ORIGINAL_DISABLE_CRON === undefined) {
      delete process.env.CLAUDE_CODE_DISABLE_CRON
    } else {
      process.env.CLAUDE_CODE_DISABLE_CRON = ORIGINAL_DISABLE_CRON
    }
  })

  test('lists no jobs with usage help', async () => {
    const result = await call('', {} as never)
    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('No scheduled cron jobs.')
    expect(result.value).toContain('/cron add <M H DoM Mon DoW> -- <prompt>')
  })

  test('adds and lists a session-only cron job', async () => {
    const add = await call('add */5 * * * * -- run the smoke tests', {} as never)
    expect(add.type).toBe('text')
    if (add.type !== 'text') return
    expect(add.value).toContain('Scheduled recurring job')
    expect(add.value).toContain('Storage: session-only')

    const list = await call('list', {} as never)
    expect(list.type).toBe('text')
    if (list.type !== 'text') return
    expect(list.value).toContain('Scheduled cron jobs:')
    expect(list.value).toContain('run the smoke tests')
  })

  test('deletes a cron job', async () => {
    await call('add */10 * * * * -- run cleanup --once', {} as never)
    const tasks = await listAllCronTasks()
    expect(tasks).toHaveLength(1)

    const deleted = await call(`delete ${tasks[0]!.id}`, {} as never)
    expect(deleted.type).toBe('text')
    if (deleted.type !== 'text') return
    expect(deleted.value).toContain(`Cancelled cron job ${tasks[0]!.id}.`)
    expect(await listAllCronTasks()).toHaveLength(0)
  })

  test('rejects invalid cron expressions', async () => {
    const result = await call('add nope -- run something', {} as never)
    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('Invalid cron expression')
  })

  test('respects the cron kill switch', async () => {
    process.env.CLAUDE_CODE_DISABLE_CRON = '1'

    const result = await call('add */5 * * * * -- run blocked job', {} as never)

    expect(result.type).toBe('text')
    if (result.type !== 'text') return
    expect(result.value).toContain('Cron scheduling is disabled')
    expect(await listAllCronTasks()).toHaveLength(0)
  })
})
