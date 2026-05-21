import type { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { createServer, type Server as HttpServer } from 'http'
import type { AddressInfo } from 'net'
import WebSocket, { WebSocketServer } from 'ws'
import type { ServerConfig } from './types.js'
import { SessionManager } from './sessionManager.js'

type ServerLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

const DEFAULT_AUTH_USERNAME = 'openclaude'
const SERVER_VERSION = '12.0.0'

type WsData = {
  sessionId: string
  cleanup?: () => void
  stdoutBuffer?: string
}

type ServerEvent = {
  id: string
  type: string
  properties: Record<string, unknown>
}

type ServerMessage = {
  info: {
    id: string
    sessionID: string
    role: 'user' | 'assistant' | 'system'
    time: {
      created: number
    }
  }
  parts: Array<{
    id: string
    sessionID: string
    messageID: string
    type: 'text'
    text: string
  }>
}

type SessionCapture = {
  stdoutBuffer: string
  cleanup: () => void
}

function hostWithPort(host: string, port: number): string {
  const normalizedHost = host === '0.0.0.0' ? '127.0.0.1' : host
  const bracketedHost =
    normalizedHost.includes(':') && !normalizedHost.startsWith('[')
      ? `[${normalizedHost}]`
      : normalizedHost
  return `${bracketedHost}:${port}`
}

function requestUrl(req: import('http').IncomingMessage): URL {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
}

function authUsername(config: ServerConfig): string {
  return config.authUsername || DEFAULT_AUTH_USERNAME
}

function basicAuthHeader(config: ServerConfig): string {
  return `Basic ${Buffer.from(`${authUsername(config)}:${config.authToken}`).toString('base64')}`
}

function isAuthorized(
  req: import('http').IncomingMessage,
  config: ServerConfig,
): boolean {
  if (!config.authToken) return true

  const authHeader = req.headers.authorization
  return (
    authHeader === `Bearer ${config.authToken}` ||
    authHeader === basicAuthHeader(config)
  )
}

function websocketUrl(
  req: import('http').IncomingMessage,
  config: ServerConfig,
  sessionId: string,
): string {
  const host = req.headers.host ?? hostWithPort(config.host, config.port)
  const protocol = (req.socket as { encrypted?: boolean }).encrypted
    ? 'wss:'
    : 'ws:'
  return `${protocol}//${host}/sessions/${sessionId}/ws`
}

function normalizeSocketMessage(
  message: WebSocket.RawData,
  isBinary: boolean,
): string {
  if (Array.isArray(message)) {
    return Buffer.concat(message).toString('utf8')
  }
  if (typeof message === 'string') {
    return message
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString('utf8')
  }
  return message.toString(isBinary ? 'binary' : 'utf8')
}

function sendLineBufferedStdout(
  ws: WebSocket & { data: WsData },
  data: Buffer,
): void {
  ws.data.stdoutBuffer = `${ws.data.stdoutBuffer ?? ''}${data.toString('utf8')}`
  const lines = ws.data.stdoutBuffer.split('\n')
  ws.data.stdoutBuffer = lines.pop() ?? ''

  for (const line of lines) {
    safeSend(ws, `${line}\n`)
  }

  if (ws.data.stdoutBuffer.length > 1_048_576) {
    safeSend(ws, ws.data.stdoutBuffer)
    ws.data.stdoutBuffer = ''
  }
}

function flushStdout(ws: WebSocket & { data: WsData }): void {
  if (ws.data.stdoutBuffer) {
    safeSend(ws, ws.data.stdoutBuffer)
    ws.data.stdoutBuffer = ''
  }
}

function safeSend(ws: WebSocket, message: string): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  } catch {}
}

function attachProcessToWebSocket(
  ws: WebSocket & { data: WsData },
  child: ChildProcess,
): () => void {
  const sendSystemMessage = (message: string) => {
    safeSend(ws, JSON.stringify({ type: 'system', message }))
  }

  const onStdout = (data: Buffer) => {
    sendLineBufferedStdout(ws, data)
  }
  const onStderr = (data: Buffer) => {
    sendSystemMessage(data.toString('utf8'))
  }
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    flushStdout(ws)
    sendSystemMessage(
      `Process exited${code === null ? '' : ` with code ${code}`}${
        signal ? ` (${signal})` : ''
      }`,
    )
    ws.close()
  }

  child.stdout?.on('data', onStdout)
  child.stderr?.on('data', onStderr)
  child.once('exit', onExit)

  return () => {
    child.stdout?.off('data', onStdout)
    child.stderr?.off('data', onStderr)
    child.off('exit', onExit)
  }
}

async function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function writeResponse(
  res: import('http').ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain',
): void {
  res.writeHead(status, { 'content-type': contentType })
  res.end(body)
}

function writeJson(
  res: import('http').ServerResponse,
  data: unknown,
  status = 200,
): void {
  writeResponse(res, status, JSON.stringify(data), 'application/json')
}

function writeSseEvent(
  res: import('http').ServerResponse,
  data: unknown,
): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function serverEvent(
  type: string,
  properties: Record<string, unknown> = {},
): ServerEvent {
  return {
    id: randomUUID(),
    type,
    properties,
  }
}

function sessionPayload(
  session: ReturnType<SessionManager['listSessions']>[number],
): Record<string, unknown> {
  return {
    id: session.id,
    session_id: session.id,
    title: session.id,
    status: session.status,
    directory: session.workDir,
    work_dir: session.workDir,
    time: {
      created: session.createdAt,
      updated: session.createdAt,
    },
    createdAt: session.createdAt,
  }
}

function createTextMessage(
  sessionId: string,
  role: ServerMessage['info']['role'],
  text: string,
): ServerMessage {
  const messageId = randomUUID()
  return {
    info: {
      id: messageId,
      sessionID: sessionId,
      role,
      time: { created: Date.now() },
    },
    parts: [
      {
        id: randomUUID(),
        sessionID: sessionId,
        messageID: messageId,
        type: 'text',
        text,
      },
    ],
  }
}

function commandList(): Array<Record<string, string>> {
  return [
    {
      name: 'permissions yolo',
      description:
        'Switch the session to yolo permissions when the REPL is ready for slash commands.',
      template: '/permissions yolo',
    },
  ]
}

function normalizeServerCommand(command: string): string {
  return command
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function isAllowedServerCommand(command: string): boolean {
  return command === 'permissions yolo'
}

export async function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: ServerLogger,
): Promise<{ port: number; stop: (force?: boolean) => void }> {
  const sseClients = new Set<import('http').ServerResponse>()
  const sseHeartbeats = new Map<
    import('http').ServerResponse,
    ReturnType<typeof setInterval>
  >()
  const messagesBySession = new Map<string, ServerMessage[]>()
  const capturesBySession = new Map<string, SessionCapture>()

  const broadcast = (payload: ServerEvent, directory?: string) => {
    const event = {
      directory: directory ?? config.workspace ?? process.cwd(),
      payload,
    }
    for (const client of sseClients) {
      writeSseEvent(client, event)
    }
  }

  const appendMessage = (message: ServerMessage) => {
    const messages = messagesBySession.get(message.info.sessionID) ?? []
    messages.push(message)
    messagesBySession.set(message.info.sessionID, messages)
    broadcast(
      serverEvent('message.updated', { info: message.info }),
      sessionManager.getSession(message.info.sessionID)?.workDir,
    )
    for (const part of message.parts) {
      broadcast(
        serverEvent('message.part.updated', { part }),
        sessionManager.getSession(message.info.sessionID)?.workDir,
      )
    }
  }

  const captureSessionOutput = (
    session: ReturnType<SessionManager['listSessions']>[number],
  ) => {
    if (!session.process || capturesBySession.has(session.id)) {
      return
    }

    const capture: SessionCapture = {
      stdoutBuffer: '',
      cleanup: () => {},
    }
    const flushLine = (line: string) => {
      const text = line.trimEnd()
      if (text.length === 0) return
      appendMessage(createTextMessage(session.id, 'assistant', text))
    }
    const onStdout = (data: Buffer) => {
      capture.stdoutBuffer += data.toString('utf8')
      const lines = capture.stdoutBuffer.split('\n')
      capture.stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        flushLine(line)
      }
      if (capture.stdoutBuffer.length > 1_048_576) {
        flushLine(capture.stdoutBuffer)
        capture.stdoutBuffer = ''
      }
    }
    const onExit = () => {
      if (capture.stdoutBuffer) {
        flushLine(capture.stdoutBuffer)
        capture.stdoutBuffer = ''
      }
      broadcast(
        serverEvent('session.status', {
          sessionID: session.id,
          status: { type: 'idle' },
        }),
        session.workDir,
      )
      capture.cleanup()
      capturesBySession.delete(session.id)
    }

    capture.cleanup = () => {
      session.process?.stdout?.off('data', onStdout)
      session.process?.off('exit', onExit)
    }
    session.process.stdout?.on('data', onStdout)
    session.process.once('exit', onExit)
    capturesBySession.set(session.id, capture)
  }

  const server: HttpServer = createServer(async (req, res) => {
    const url = requestUrl(req)

    if (!isAuthorized(req, config)) {
      res.setHeader('www-authenticate', `Basic realm="OpenClaude"`)
      writeResponse(res, 401, 'Unauthorized')
      return
    }

    if (req.method === 'GET' && url.pathname === '/global/health') {
      writeJson(res, {
        healthy: true,
        version: SERVER_VERSION,
        service: 'openclaude',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/command') {
      writeJson(res, commandList())
      return
    }

    if (req.method === 'GET' && url.pathname === '/global/event') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      })

      sseClients.add(res)
      const directory =
        url.searchParams.get('directory') ?? config.workspace ?? process.cwd()
      writeSseEvent(res, {
        directory,
        payload: serverEvent('server.connected'),
      })
      const heartbeat = setInterval(() => {
        writeSseEvent(res, {
          directory,
          payload: serverEvent('server.heartbeat'),
        })
      }, 10_000)
      heartbeat.unref?.()
      sseHeartbeats.set(res, heartbeat)
      res.on('close', () => {
        clearInterval(heartbeat)
        sseHeartbeats.delete(res)
        sseClients.delete(res)
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/sessions') {
      try {
        const body = (await readJsonBody(req)) as {
          cwd?: string
          model?: string
          provider?: string
          dangerously_skip_permissions?: boolean
        }
        const session = sessionManager.createSession(body.cwd || process.cwd(), {
          model: body.model,
          provider: body.provider,
          dangerouslySkipPermissions: body.dangerously_skip_permissions,
        })
        messagesBySession.set(session.id, [])
        captureSessionOutput(session)
        broadcast(
          serverEvent('session.created', { info: sessionPayload(session) }),
          session.workDir,
        )

        writeJson(res, {
          session_id: session.id,
          ws_url: websocketUrl(req, config, session.id),
          work_dir: session.workDir,
        })
      } catch (err) {
        writeJson(
          res,
          { error: err instanceof Error ? err.message : String(err) },
          400,
        )
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/session') {
      try {
        const body = (await readJsonBody(req)) as {
          directory?: string
          cwd?: string
          model?: string
          provider?: string
          dangerously_skip_permissions?: boolean
        }
        const session = sessionManager.createSession(
          body.directory || body.cwd || config.workspace || process.cwd(),
          {
            model: body.model,
            provider: body.provider,
            dangerouslySkipPermissions: body.dangerously_skip_permissions,
          },
        )
        messagesBySession.set(session.id, [])
        captureSessionOutput(session)
        broadcast(
          serverEvent('session.created', { info: sessionPayload(session) }),
          session.workDir,
        )
        writeJson(res, sessionPayload(session))
      } catch (err) {
        writeJson(
          res,
          { error: err instanceof Error ? err.message : String(err) },
          400,
        )
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/sessions') {
      const sessions = sessionManager.listSessions().map(s => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
        workDir: s.workDir,
      }))
      writeJson(res, sessions)
      return
    }

    if (req.method === 'GET' && url.pathname === '/session') {
      writeJson(res, sessionManager.listSessions().map(sessionPayload))
      return
    }

    if (req.method === 'GET' && url.pathname === '/session/status') {
      writeJson(
        res,
        sessionManager.listSessions().map(session => ({
          id: session.id,
          sessionID: session.id,
          status: session.status,
          directory: session.workDir,
        })),
      )
      return
    }

    const sessionMessageMatch = url.pathname.match(/^\/session\/([^/]+)\/message$/)
    if (sessionMessageMatch) {
      const sessionId = sessionMessageMatch[1]
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        writeJson(res, { error: 'Session not found' }, 404)
        return
      }

      if (req.method === 'GET') {
        writeJson(res, messagesBySession.get(sessionId) ?? [])
        return
      }

      if (req.method === 'POST') {
        const body = (await readJsonBody(req)) as {
          parts?: Array<{ type?: string; text?: string }>
          text?: string
        }
        const text =
          body.text ??
          body.parts
            ?.filter(part => part.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('\n')

        if (!text) {
          writeJson(res, { error: 'Prompt text is required' }, 400)
          return
        }
        if (!session.process?.stdin) {
          writeJson(res, { error: 'Session is not running' }, 409)
          return
        }

        const message = createTextMessage(session.id, 'user', text)
        appendMessage(message)
        broadcast(
          serverEvent('session.status', {
            sessionID: session.id,
            status: { type: 'busy' },
          }),
          session.workDir,
        )
        session.process.stdin.write(`${text}\n`)
        writeJson(res, message)
        return
      }
    }

    const sessionCommandMatch = url.pathname.match(/^\/session\/([^/]+)\/command$/)
    if (req.method === 'POST' && sessionCommandMatch) {
      const sessionId = sessionCommandMatch[1]
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        writeJson(res, { error: 'Session not found' }, 404)
        return
      }

      const body = (await readJsonBody(req)) as { command?: string }
      const command = normalizeServerCommand(
        typeof body.command === 'string' ? body.command : '',
      )
      if (!isAllowedServerCommand(command)) {
        writeJson(res, { error: 'Command is not available from server.' }, 403)
        return
      }
      if (!session.process?.stdin) {
        writeJson(res, { error: 'Session is not running' }, 409)
        return
      }

      const text = `/${command}`
      const message = createTextMessage(session.id, 'user', text)
      appendMessage(message)
      session.process.stdin.write(`${text}\n`)
      writeJson(res, message)
      return
    }

    const sessionAbortMatch = url.pathname.match(/^\/session\/([^/]+)\/abort$/)
    if (req.method === 'POST' && sessionAbortMatch) {
      const sessionId = sessionAbortMatch[1]
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        writeJson(res, { error: 'Session not found' }, 404)
        return
      }
      sessionManager.stopSession(sessionId)
      broadcast(
        serverEvent('session.status', {
          sessionID: sessionId,
          status: { type: 'idle' },
        }),
        session.workDir,
      )
      writeJson(res, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/project') {
      const directory =
        url.searchParams.get('directory') ?? config.workspace ?? process.cwd()
      writeJson(res, [
        {
          id: directory,
          directory,
          name: directory.split('/').filter(Boolean).pop() ?? directory,
        },
      ])
      return
    }

    writeResponse(res, 404, 'Not Found')
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = requestUrl(req)

    if (!isAuthorized(req, config)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const wsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/)
    if (!wsMatch) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    const sessionId = wsMatch[1]
    const session = sessionManager.getSession(sessionId)
    if (!session?.process) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, ws => {
      const typedWs = ws as WebSocket & { data: WsData }
      typedWs.data = { sessionId }
      wss.emit('connection', typedWs, req)
    })
  })

  wss.on('connection', ws => {
    const typedWs = ws as WebSocket & { data: WsData }
    const { sessionId } = typedWs.data
    const session = sessionManager.getSession(sessionId)
    if (!session?.process || !sessionManager.attachSession(sessionId)) {
      typedWs.close()
      return
    }

    logger.info(`WebSocket connected for session ${sessionId}`)
    typedWs.data.cleanup = attachProcessToWebSocket(typedWs, session.process)

    typedWs.on('message', (message, isBinary) => {
      const current = sessionManager.getSession(sessionId)
      if (current?.process?.stdin) {
        current.process.stdin.write(
          `${normalizeSocketMessage(message, isBinary)}\n`,
        )
      }
    })

    typedWs.on('close', () => {
      typedWs.data.cleanup?.()
      sessionManager.detachSession(sessionId)
      logger.info(`WebSocket disconnected for session ${sessionId}`)
    })
  })

  const listenPromise = new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  if (config.unix) {
    server.listen(config.unix)
  } else {
    server.listen(config.port, config.host)
  }

  await listenPromise

  return {
    port:
      typeof server.address() === 'object' && server.address() !== null
        ? (server.address() as AddressInfo).port
        : config.port,
    stop: (force?: boolean) => {
      wss.close()
      if (force) {
        for (const socket of wss.clients) {
          socket.terminate()
        }
      }
      for (const client of sseClients) {
        clearInterval(sseHeartbeats.get(client))
        client.end()
      }
      sseHeartbeats.clear()
      sseClients.clear()
      server.close()
    },
  }
}
