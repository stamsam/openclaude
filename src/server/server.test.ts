import { afterEach, describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'
import { startServer } from './server.js'
import { SessionManager } from './sessionManager.js'

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()

  kill(): boolean {
    queueMicrotask(() => this.emit('exit', 0, null))
    return true
  }
}

const servers: Array<{ stop: (force?: boolean) => void }> = []

function basicAuth(password: string, username = 'openclaude'): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function makeServer(authToken = 'test-token') {
  const children: FakeChildProcess[] = []
  const manager = new SessionManager({
    spawnSession: () => {
      const child = new FakeChildProcess()
      children.push(child)
      return child as unknown as ChildProcess
    },
  })
  const server = await startServer(
    {
      port: 0,
      host: '127.0.0.1',
      authToken,
      authUsername: 'openclaude',
    },
    manager,
    {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  )
  servers.push(server)
  return { baseUrl: `http://127.0.0.1:${server.port}`, children, manager }
}

function parseSseChunk(text: string): { directory: string; payload: { type: string; properties: Record<string, unknown> } } {
  const line = text
    .split('\n')
    .find(chunkLine => chunkLine.startsWith('data: '))
  if (!line) {
    throw new Error(`Missing SSE data line: ${text}`)
  }
  return JSON.parse(line.slice('data: '.length))
}

afterEach(() => {
  while (servers.length > 0) {
    servers.pop()?.stop(true)
  }
})

describe('OpenClaude mobile server API', () => {
  test('global health accepts OpenCode-style Basic auth', async () => {
    const { baseUrl } = await makeServer()

    const res = await fetch(`${baseUrl}/global/health`, {
      headers: { authorization: basicAuth('test-token') },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      healthy: true,
      service: 'openclaude',
    })
  })

  test('protected routes reject missing auth', async () => {
    const { baseUrl } = await makeServer()

    const res = await fetch(`${baseUrl}/global/health`)

    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Basic')
  })

  test('global event stream starts with server.connected', async () => {
    const { baseUrl } = await makeServer()
    const controller = new AbortController()

    const res = await fetch(`${baseUrl}/global/event?directory=/tmp/project`, {
      headers: { authorization: basicAuth('test-token') },
      signal: controller.signal,
    })
    const chunk = await res.body?.getReader().read()
    controller.abort()

    const text = Buffer.from(chunk?.value ?? new Uint8Array()).toString('utf8')
    const event = parseSseChunk(text)
    expect(event.directory).toBe('/tmp/project')
    expect(event.payload.type).toBe('server.connected')
    expect(event.payload.properties).toEqual({})
  })

  test('session alias creates sessions in the requested directory', async () => {
    const { baseUrl, manager } = await makeServer()

    const res = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ directory: '/tmp/mobile-project' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.directory).toBe('/tmp/mobile-project')
    expect(manager.listSessions()).toHaveLength(1)
  })

  test('prompt endpoint stores OpenCode-style message records', async () => {
    const { baseUrl } = await makeServer()

    const sessionRes = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ directory: '/tmp/mobile-project' }),
    })
    const session = await sessionRes.json()

    const promptRes = await fetch(`${baseUrl}/session/${session.id}/message`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parts: [{ type: 'text', text: 'hello mobile' }] }),
    })

    expect(promptRes.status).toBe(200)
    const created = await promptRes.json()
    expect(created.info).toMatchObject({
      sessionID: session.id,
      role: 'user',
    })
    expect(created.parts[0]).toMatchObject({
      messageID: created.info.id,
      text: 'hello mobile',
      type: 'text',
    })

    const messagesRes = await fetch(`${baseUrl}/session/${session.id}/message`, {
      headers: { authorization: basicAuth('test-token') },
    })
    const messages = await messagesRes.json()
    expect(messages).toHaveLength(1)
    expect(messages[0].parts[0].text).toBe('hello mobile')
  })

  test('command endpoint exposes and forwards permissions yolo', async () => {
    const { baseUrl, children } = await makeServer()

    const commandsRes = await fetch(`${baseUrl}/command`, {
      headers: { authorization: basicAuth('test-token') },
    })
    expect(commandsRes.status).toBe(200)
    expect(await commandsRes.json()).toEqual([
      {
        name: 'permissions yolo',
        description:
          'Switch the session to yolo permissions when the REPL is ready for slash commands.',
        template: '/permissions yolo',
      },
    ])

    const sessionRes = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ directory: '/tmp/mobile-project' }),
    })
    const session = await sessionRes.json()

    const commandRes = await fetch(`${baseUrl}/session/${session.id}/command`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: '/permissions   yolo' }),
    })

    expect(commandRes.status).toBe(200)
    const message = await commandRes.json()
    expect(message.parts[0].text).toBe('/permissions yolo')

    await new Promise(resolve => setTimeout(resolve, 0))
    const stdinText = children[0].stdin.read()?.toString('utf8') ?? ''
    expect(stdinText).toBe('/permissions yolo\n')

    const rejected = await fetch(`${baseUrl}/session/${session.id}/command`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: 'exit' }),
    })
    expect(rejected.status).toBe(403)
  })

  test('captures process stdout as assistant messages', async () => {
    const { baseUrl, children } = await makeServer()

    const sessionRes = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: {
        authorization: basicAuth('test-token'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ directory: '/tmp/mobile-project' }),
    })
    const session = await sessionRes.json()

    children[0].stdout.write('assistant line\n')
    await new Promise(resolve => setTimeout(resolve, 0))

    const messagesRes = await fetch(`${baseUrl}/session/${session.id}/message`, {
      headers: { authorization: basicAuth('test-token') },
    })
    const messages = await messagesRes.json()
    expect(messages).toHaveLength(1)
    expect(messages[0].info.role).toBe('assistant')
    expect(messages[0].parts[0].text).toBe('assistant line')
  })
})
