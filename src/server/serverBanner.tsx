export function printBanner(config: { port: number; host: string; authUsername?: string }, authToken: string, actualPort: number): void {
  const displayHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
  const endpoint = `http://${displayHost}:${actualPort}`
  const eventStream = `${endpoint}/global/event`
  const websocket = `ws://${config.host}:${actualPort}/sessions/:id/ws`
  const auth = authToken ? 'enabled (REDACTED)' : 'disabled (INSECURE)'
  const username = config.authUsername || 'openclaude'

  process.stdout.write(
    [
      '',
      'OpenClaude Server',
      'v12.0.0 - Headless Mobile API',
      '',
      `Endpoint:  ${endpoint}`,
      `Health:    ${endpoint}/global/health`,
      `Events:    ${eventStream}`,
      `WebSocket: ${websocket}`,
      `Auth:      ${auth} (Basic user: ${username}; Bearer still accepted)`,
      'Status:    ONLINE',
      '',
      'Listening for remote connections. Press Ctrl+C to stop.',
      '',
    ].join('\n'),
  )
}
