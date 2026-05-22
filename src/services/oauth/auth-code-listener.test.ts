import { afterEach, expect, test } from 'bun:test'

import { AuthCodeListener } from './auth-code-listener.js'

const listeners: AuthCodeListener[] = []

afterEach(() => {
  while (listeners.length > 0) {
    listeners.pop()?.close()
  }
})

test('cancelPendingAuthorization rejects a pending OAuth wait', async () => {
  const listener = new AuthCodeListener('/callback')
  listeners.push(listener)

  await listener.start()

  const pendingAuthorization = listener.waitForAuthorization(
    'state-test',
    async () => {},
  )

  listener.cancelPendingAuthorization(
    new Error('Codex OAuth flow was cancelled.'),
  )

  await expect(pendingAuthorization).rejects.toThrow(
    'Codex OAuth flow was cancelled.',
  )
})

test('waitForAuthorization accepts callbacks on an explicit loopback host', async () => {
  const listener = new AuthCodeListener('/callback', '127.0.0.1')
  listeners.push(listener)

  const port = await listener.start()
  let callbackResponse: Promise<Response> | null = null

  const authorizationCode = await listener.waitForAuthorization(
    'state-test',
    async () => {
      callbackResponse = fetch(
        `http://127.0.0.1:${port}/callback?code=oauth-code&state=state-test`,
      )
    },
  )

  expect(authorizationCode).toBe('oauth-code')
  expect(listener.hasPendingResponse()).toBe(true)

  listener.handleSuccessRedirect([], res => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ok')
  })

  expect(callbackResponse).not.toBeNull()
  await expect(callbackResponse!.then(response => response.text())).resolves.toBe(
    'ok',
  )
})

test('waitForAuthorization answers allowed OAuth preflight without rejecting the flow', async () => {
  const listener = new AuthCodeListener('/callback', '127.0.0.1', {
    allowedCorsOrigins: ['https://accounts.x.ai'],
  })
  listeners.push(listener)

  const port = await listener.start()
  let callbackResponse: Promise<Response> | null = null

  const pendingAuthorization = listener.waitForAuthorization(
    'state-test',
    async () => {
      const preflight = await fetch(`http://127.0.0.1:${port}/callback`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://accounts.x.ai',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Private-Network': 'true',
        },
      })

      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        'https://accounts.x.ai',
      )
      expect(preflight.headers.get('access-control-allow-private-network')).toBe(
        'true',
      )

      callbackResponse = fetch(
        `http://127.0.0.1:${port}/callback?code=oauth-code&state=state-test`,
        {
          headers: {
            Origin: 'https://accounts.x.ai',
          },
        },
      )
    },
  )

  await expect(pendingAuthorization).resolves.toBe('oauth-code')

  listener.handleSuccessRedirect([], res => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ok')
  })

  expect(callbackResponse).not.toBeNull()
  const response = await callbackResponse!
  expect(response.headers.get('access-control-allow-origin')).toBe(
    'https://accounts.x.ai',
  )
  expect(await response.text()).toBe('ok')
})
