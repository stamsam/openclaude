import { describe, expect, test } from 'bun:test'
import { startMobileServer } from './server.js'

describe('mobile server', () => {
  test('requires token auth for status and accepts prompts', async () => {
    const submitted: string[] = []
    let stopCount = 0
    const server = await startMobileServer({
      host: '127.0.0.1',
      port: 0,
      token: 'sam-test-token',
      acceptedTokens: ['sam-test-token', 'sam-second-device-token'],
      getSnapshot: () => ({
        state: 'idle',
        workspace: '/tmp/project',
        model: 'test-model',
        lastResponse: 'hello',
        canSubmit: true,
        canStop: false,
        busyOwner: null,
        messages: [{ id: 'm1', role: 'assistant', text: 'ready' }],
      }),
      submitPrompt: prompt => {
        submitted.push(prompt)
        return { ok: true, runId: 'run-1' }
      },
      stopCurrentRun: () => {
        stopCount += 1
        return true
      },
    })

    try {
      const baseUrl = server.url.replace(/\?.*/, '')
      const denied = await fetch(`${baseUrl}api/status`)
      expect(denied.status).toBe(401)

      const healthDenied = await fetch(`${baseUrl}health`)
      expect(healthDenied.status).toBe(401)

      const docsDenied = await fetch(`${baseUrl}doc`)
      expect(docsDenied.status).toBe(401)

      const openapiDenied = await fetch(`${baseUrl}openapi.json`)
      expect(openapiDenied.status).toBe(401)

      const manifest = await fetch(`${baseUrl}manifest.webmanifest`)
      expect(manifest.status).toBe(200)
      expect(manifest.headers.get('content-type')).toContain(
        'application/manifest+json',
      )
      expect(await manifest.json()).toMatchObject({
        name: 'OpenClaude Mobile',
        display: 'standalone',
      })

      const status = await fetch(`${baseUrl}api/status`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(status.status).toBe(200)
      expect(await status.json()).toMatchObject({
        state: 'idle',
        workspace: '/tmp/project',
        model: 'test-model',
      })

      const basicStatus = await fetch(`${baseUrl}api/status`, {
        headers: {
          authorization:
            'Basic ' + Buffer.from('openclaude:sam-test-token').toString('base64'),
        },
      })
      expect(basicStatus.status).toBe(200)

      const accepted = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'hi' }),
      })
      expect(accepted.status).toBe(202)
      expect(submitted).toEqual(['hi'])

      const invalidJson = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: '{',
      })
      expect(invalidJson.status).toBe(400)
      expect(await invalidJson.json()).toMatchObject({
        error: 'Invalid JSON body',
      })

      const emptyPrompt = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: '   ' }),
      })
      expect(emptyPrompt.status).toBe(400)

      const crossSite = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
          origin: 'http://evil.example',
        },
        body: JSON.stringify({ prompt: 'hi from elsewhere' }),
      })
      expect(crossSite.status).toBe(403)
      expect(await crossSite.json()).toEqual({
        error: 'Cross-site requests are not allowed',
      })

      const fetchMetadataCrossSite = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({ prompt: 'csrf' }),
      })
      expect(fetchMetadataCrossSite.status).toBe(403)
      expect(submitted).not.toContain('csrf')

      const sameOrigin = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
          origin: new URL(baseUrl).origin,
        },
        body: JSON.stringify({ prompt: 'same origin ok' }),
      })
      expect(sameOrigin.status).toBe(202)
      expect(submitted).toContain('same origin ok')

      const oversized = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'x'.repeat(70 * 1024) }),
      })
      expect(oversized.status).toBe(413)
      expect(await oversized.json()).toEqual({
        error: 'Request body too large',
      })

      const queryMutation = await fetch(
        `${baseUrl}api/message?token=sam-test-token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: 'query mutation' }),
        },
      )
      expect(queryMutation.status).toBe(401)
      expect(submitted).not.toContain('query mutation')

      const malformedCookie = await fetch(`${baseUrl}api/status`, {
        headers: { cookie: 'sam_mobile_token=%E0%A4%A' },
      })
      expect(malformedCookie.status).toBe(401)

      const queryAuth = await fetch(
        `${baseUrl}api/status?token=sam-test-token`,
      )
      expect(queryAuth.status).toBe(200)
      expect(queryAuth.headers.get('set-cookie')).toBeNull()

      const snapshot = await fetch(`${baseUrl}api/snapshot`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(snapshot.status).toBe(200)
      expect(await snapshot.json()).toMatchObject({
        state: 'idle',
        workspace: '/tmp/project',
        model: 'test-model',
        canSubmit: true,
        canStop: false,
      })

      const health = await fetch(`${baseUrl}global/health`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(health.status).toBe(200)
      expect(await health.json()).toMatchObject({
        healthy: true,
        mode: 'mobile-companion',
      })

      const project = await fetch(`${baseUrl}project/current`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(project.status).toBe(200)
      expect(await project.json()).toMatchObject({
        id: 'current',
        directory: '/tmp/project',
        name: 'project',
      })

      const projects = await fetch(`${baseUrl}project`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(projects.status).toBe(200)
      expect(await projects.json()).toMatchObject([
        {
          id: 'current',
          directory: '/tmp/project',
          name: 'project',
        },
      ])

      const provider = await fetch(`${baseUrl}provider`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(provider.status).toBe(200)
      expect(await provider.json()).toMatchObject({
        all: [
          {
            id: 'openclaude',
            name: 'OpenClaude',
            models: [{ id: 'test-model', name: 'test-model' }],
          },
        ],
        default: {
          providerID: 'openclaude',
          modelID: 'test-model',
        },
        connected: ['openclaude'],
      })

      const providerAuth = await fetch(`${baseUrl}provider/auth`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(providerAuth.status).toBe(200)
      expect(await providerAuth.json()).toEqual({})

      const authMutation = await fetch(`${baseUrl}auth/openclaude`, {
        method: 'PUT',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'nope' }),
      })
      expect(authMutation.status).toBe(404)

      const configProviders = await fetch(`${baseUrl}config/providers`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(configProviders.status).toBe(200)
      expect(await configProviders.json()).toMatchObject({
        providers: [
          {
            id: 'openclaude',
            models: [{ id: 'test-model' }],
          },
        ],
        default: {
          providerID: 'openclaude',
          modelID: 'test-model',
        },
      })

      const config = await fetch(`${baseUrl}config`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(config.status).toBe(200)
      expect(await config.json()).toMatchObject({
        theme: 'openclaude-mobile',
        model: 'test-model',
        provider: 'openclaude',
        path: {
          cwd: '/tmp/project',
        },
      })

      const commands = await fetch(`${baseUrl}command`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(commands.status).toBe(200)
      expect(await commands.json()).toEqual([
        {
          name: 'dismiss',
          description: 'Dismiss the active local overlay.',
          template: '/dismiss',
        },
      ])

      const sessions = await fetch(`${baseUrl}session`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(sessions.status).toBe(200)
      expect(await sessions.json()).toMatchObject([
        {
          id: 'live',
          title: 'Live terminal session',
          directory: '/tmp/project',
        },
      ])

      const statuses = await fetch(`${baseUrl}session/status`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(statuses.status).toBe(200)
      expect(await statuses.json()).toMatchObject({
        live: {
          state: 'idle',
          active: false,
        },
      })

      const messages = await fetch(`${baseUrl}session/live/message`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(messages.status).toBe(200)
      expect(await messages.json()).toEqual([
        {
          info: {
            id: 'm1',
            sessionID: 'live',
            role: 'assistant',
            time: expect.any(Object),
          },
          parts: [{ id: 'm1-text', type: 'text', text: 'ready' }],
        },
      ])

      const eventAbort = new AbortController()
      const events = await fetch(`${baseUrl}global/event`, {
        headers: { authorization: 'Bearer sam-test-token' },
        signal: eventAbort.signal,
      })
      expect(events.status).toBe(200)
      expect(events.headers.get('content-type')).toContain('text/event-stream')
      const reader = events.body?.getReader()
      expect(reader).toBeTruthy()
      const firstEvent = await reader!.read()
      eventAbort.abort()
      const eventText = new TextDecoder().decode(firstEvent.value)
      expect(eventText).toContain('server.connected')

      const docs = await fetch(`${baseUrl}doc`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(docs.status).toBe(200)
      expect(await docs.text()).toContain('/global/event')

      const openapi = await fetch(`${baseUrl}openapi.json`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(openapi.status).toBe(200)
      const openapiJson = await openapi.json()
      expect(openapiJson).toMatchObject({
        openapi: '3.1.0',
        info: {
          title: 'OpenClaude Mobile Companion API',
        },
        'x-openclaude': {
          mode: 'mobile-companion',
          sessionID: 'live',
          project: 'project',
        },
      })
      expect(openapiJson.paths).toHaveProperty('/project')
      expect(openapiJson.paths).toHaveProperty('/project/current')
      expect(openapiJson.paths).toHaveProperty('/provider')
      expect(openapiJson.paths).toHaveProperty('/provider/auth')
      expect(openapiJson.paths).toHaveProperty('/config')
      expect(openapiJson.paths).toHaveProperty('/config/providers')
      expect(openapiJson.paths).toHaveProperty('/command')
      expect(openapiJson.paths).toHaveProperty('/session/live')
      expect(openapiJson.paths).toHaveProperty('/session/live/message')
      expect(openapiJson.paths).toHaveProperty('/session/live/prompt_async')
      expect(openapiJson.paths).toHaveProperty('/session/live/command')
      expect(openapiJson.paths).toHaveProperty('/session/live/abort')
      expect(openapiJson.components.securitySchemes).toMatchObject({
        bearerAuth: { type: 'http', scheme: 'bearer' },
        basicAuth: { type: 'http', scheme: 'basic' },
      })

      const pairedPage = await fetch(`${baseUrl}?token=sam-second-device-token`)
      expect(pairedPage.status).toBe(200)
      expect(pairedPage.headers.get('set-cookie')).toContain(
        'sam_mobile_token=sam-second-device-token',
      )
      expect(pairedPage.headers.get('set-cookie')).toContain('HttpOnly')
      expect(pairedPage.headers.get('content-security-policy')).toContain(
        "default-src 'self'",
      )
      expect(pairedPage.headers.get('content-security-policy')).toContain(
        "object-src 'none'",
      )
      expect(pairedPage.headers.get('content-security-policy')).toContain(
        "worker-src 'none'",
      )
      expect(pairedPage.headers.get('content-security-policy')).not.toContain(
        "'unsafe-inline'",
      )
      expect(pairedPage.headers.get('content-security-policy')).toMatch(
        /style-src 'nonce-[^']+'/,
      )
      expect(pairedPage.headers.get('content-security-policy')).toMatch(
        /script-src 'nonce-[^']+'/,
      )
      expect(pairedPage.headers.get('referrer-policy')).toBe('no-referrer')
      const pairedHtml = await pairedPage.text()
      expect(pairedHtml).toContain('window.__SAM_INITIAL_SNAPSHOT__')
      expect(pairedHtml).toMatch(/<style nonce="[^"]+">/)
      expect(pairedHtml).toMatch(/<script nonce="[^"]+">/)

      const cookieAuth = await fetch(`${baseUrl}api/status`, {
        headers: { cookie: 'sam_mobile_token=sam-second-device-token' },
      })
      expect(cookieAuth.status).toBe(200)

      const cookieMutationDenied = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          cookie: 'sam_mobile_token=sam-second-device-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'cookie no csrf' }),
      })
      expect(cookieMutationDenied.status).toBe(403)
      expect(await cookieMutationDenied.json()).toEqual({
        error: 'Mobile CSRF header is required',
      })
      expect(submitted).not.toContain('cookie no csrf')

      const cookieMutation = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          cookie: 'sam_mobile_token=sam-second-device-token',
          'content-type': 'application/json',
          'x-openclaude-mobile': '1',
        },
        body: JSON.stringify({ prompt: 'cookie ok' }),
      })
      expect(cookieMutation.status).toBe(202)
      expect(submitted).toContain('cookie ok')

      const stop = await fetch(`${baseUrl}api/stop`, {
        method: 'POST',
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(stop.status).toBe(200)
      expect(stopCount).toBe(1)

      const invalidPage = await fetch(`${baseUrl}?token=wrong-token`)
      expect(invalidPage.status).toBe(200)
      expect(invalidPage.headers.get('set-cookie')).toContain('Max-Age=0')
      expect(await invalidPage.text()).toContain(
        'window.__SAM_TOKEN_STATE__ = "invalid"',
      )
    } finally {
      await server.stop()
    }
  })

  test('accepts OpenCode-style session mutation aliases', async () => {
    const submitted: string[] = []
    let stopCount = 0
    const server = await startMobileServer({
      host: '127.0.0.1',
      port: 0,
      token: 'sam-test-token',
      getSnapshot: () => ({
        state: 'idle',
        workspace: '/tmp/project',
        canSubmit: true,
        canStop: true,
      }),
      submitPrompt: prompt => {
        submitted.push(prompt)
        return { ok: true, runId: 'run-opencode' }
      },
      stopCurrentRun: () => {
        stopCount += 1
        return true
      },
    })

    try {
      const baseUrl = server.url.replace(/\?.*/, '')
      const session = await fetch(`${baseUrl}session/live`, {
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(session.status).toBe(200)
      expect(await session.json()).toMatchObject({
        id: 'live',
        directory: '/tmp/project',
      })

      const message = await fetch(`${baseUrl}session/live/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          parts: [
            { type: 'text', text: 'first line' },
            { type: 'text', text: 'second line' },
          ],
        }),
      })
      expect(message.status).toBe(202)
      expect(await message.json()).toMatchObject({
        info: {
          id: 'run-opencode',
          sessionID: 'live',
          role: 'user',
        },
        parts: [
          {
            id: 'run-opencode-text',
            type: 'text',
            text: 'first line\nsecond line',
          },
        ],
      })
      expect(submitted).toEqual(['first line\nsecond line'])

      const missingText = await fetch(`${baseUrl}session/live/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ parts: [{ type: 'file', text: 'ignored' }] }),
      })
      expect(missingText.status).toBe(400)

      const asyncPrompt = await fetch(`${baseUrl}session/live/prompt_async`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'background prompt' }),
      })
      expect(asyncPrompt.status).toBe(204)
      expect(await asyncPrompt.text()).toBe('')
      expect(submitted).toContain('background prompt')

      const cookieMutationDenied = await fetch(`${baseUrl}session/live/message`, {
        method: 'POST',
        headers: {
          cookie: 'sam_mobile_token=sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'cookie alias' }),
      })
      expect(cookieMutationDenied.status).toBe(403)
      expect(submitted).not.toContain('cookie alias')

      const command = await fetch(`${baseUrl}session/live/command`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ command: 'dismiss' }),
      })
      expect(command.status).toBe(202)
      expect(await command.json()).toMatchObject({
        info: {
          id: 'run-opencode',
          role: 'user',
        },
        parts: [
          {
            text: '/dismiss',
          },
        ],
      })
      expect(submitted).toContain('/dismiss')

      const rejectedCommand = await fetch(`${baseUrl}session/live/command`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ command: 'exit' }),
      })
      expect(rejectedCommand.status).toBe(403)
      expect(submitted).not.toContain('/exit')

      const abort = await fetch(`${baseUrl}session/live/abort`, {
        method: 'POST',
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(abort.status).toBe(200)
      expect(await abort.json()).toBe(true)
      expect(stopCount).toBe(1)
    } finally {
      await server.stop()
    }
  })

  test('root page does not leak snapshots before pairing', async () => {
    let snapshotCalls = 0
    const server = await startMobileServer({
      host: '127.0.0.1',
      port: 0,
      token: 'sam-test-token',
      getSnapshot: () => {
        snapshotCalls += 1
        return {
          state: 'idle',
          workspace: '/tmp/private-project',
          model: 'secret-model',
        }
      },
      submitPrompt: () => ({ ok: true }),
      stopCurrentRun: () => false,
    })

    try {
      const baseUrl = server.url.replace(/\?.*/, '')
      const missing = await fetch(baseUrl)
      const missingText = await missing.text()
      expect(snapshotCalls).toBe(0)
      expect(missing.status).toBe(200)
      expect(missing.headers.get('set-cookie')).toBeNull()
      expect(missingText).toContain('window.__SAM_TOKEN_STATE__ = "missing"')
      expect(missingText).not.toContain('/tmp/private-project')
      expect(missingText).not.toContain('secret-model')

      const invalid = await fetch(`${baseUrl}?token=wrong-token`)
      const invalidText = await invalid.text()
      expect(snapshotCalls).toBe(0)
      expect(invalid.status).toBe(200)
      expect(invalid.headers.get('set-cookie')).toContain('Max-Age=0')
      expect(invalidText).toContain('window.__SAM_TOKEN_STATE__ = "invalid"')
      expect(invalidText).not.toContain('/tmp/private-project')
      expect(invalidText).not.toContain('secret-model')
    } finally {
      await server.stop()
    }
  })

  test('passes submit and stop failures through', async () => {
    const server = await startMobileServer({
      host: '127.0.0.1',
      port: 0,
      token: 'sam-test-token',
      getSnapshot: () => ({
        state: 'busy',
        workspace: '/tmp/project',
        busyOwner: 'terminal',
        canSubmit: false,
        canStop: false,
      }),
      submitPrompt: () => ({
        ok: false,
        status: 409,
        error: 'Sam is already working.',
      }),
      stopCurrentRun: () => false,
    })

    try {
      const baseUrl = server.url.replace(/\?.*/, '')
      const rejectedSubmit = await fetch(`${baseUrl}api/message`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer sam-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'hi' }),
      })
      expect(rejectedSubmit.status).toBe(409)
      expect(await rejectedSubmit.json()).toEqual({
        error: 'Sam is already working.',
      })

      const stop = await fetch(`${baseUrl}api/stop`, {
        method: 'POST',
        headers: { authorization: 'Bearer sam-test-token' },
      })
      expect(stop.status).toBe(409)
      expect(await stop.json()).toEqual({
        error: 'No mobile-owned run is active.',
      })
    } finally {
      await server.stop()
    }
  })

  test('stop closes active SSE clients', async () => {
    const server = await startMobileServer({
      host: '127.0.0.1',
      port: 0,
      token: 'sam-test-token',
      getSnapshot: () => ({
        state: 'idle',
        workspace: '/tmp/project',
      }),
      submitPrompt: () => ({ ok: true }),
      stopCurrentRun: () => false,
    })

    const baseUrl = server.url.replace(/\?.*/, '')
    const events = await fetch(`${baseUrl}global/event`, {
      headers: { authorization: 'Bearer sam-test-token' },
    })
    const reader = events.body?.getReader()
    expect(reader).toBeTruthy()
    await reader!.read()

    const result = await Promise.race([
      server.stop().then(() => 'stopped'),
      new Promise(resolve => setTimeout(() => resolve('timed out'), 500)),
    ])
    expect(result).toBe('stopped')
    const closed = await reader!.read()
    expect(closed.done).toBe(true)
  })
})
