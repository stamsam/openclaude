import { describe, expect, test } from 'bun:test'
import { renderMobileServerHtml } from './html.js'

describe('mobile server html', () => {
  test('includes iPhone-friendly virtual modifier and control keys', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain('data-mod="shift"')
    expect(html).toContain('data-mod="cmd"')
    expect(html).toContain('data-mod="alt"')
    expect(html).toContain('data-mod="ctrl"')
    expect(html).toContain('data-key="esc"')
    expect(html).toContain('data-key="tab"')
    expect(html).toContain('data-key="enter"')
    expect(html).toContain('data-key="left"')
    expect(html).toContain('data-key="right"')
    expect(html).toContain('data-key="up"')
    expect(html).toContain('data-key="down"')
    expect(html).toContain('data-key="c"')
    expect(html).toContain('data-key="d"')
  })

  test('keeps the prompt terminal-like on mobile keyboards', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain('autocapitalize="off"')
    expect(html).toContain('autocorrect="off"')
    expect(html).toContain('spellcheck="false"')
    expect(html).toContain('enterkeyhint="send"')
    expect(html).toContain('button:disabled')
    expect(html).toContain('function updateControls(snapshot = latestSnapshot)')
    expect(html).toContain('snapshot?.canSubmit')
    expect(html).toContain('snapshot?.canStop')
    expect(html).toContain("if (key === 'left')")
    expect(html).toContain("if (key === 'up')")
    expect(html).toContain('function resizePrompt()')
    expect(html).toContain('interactive-widget=resizes-content')
    expect(html).toContain('font-size: 16px')
    expect(html).toContain('body.typing .rail')
    expect(html).toContain('body.typing #terminal')
    expect(html).toContain('--terminal-bottom-pad')
    expect(html).toContain('scroll-padding-bottom')
    expect(html).toContain('padding-bottom: max(48px, env(safe-area-inset-bottom))')
    expect(html).toContain('function syncViewportHeight()')
    expect(html).toContain('window.visualViewport')
    expect(html).toContain('function wrapTerminalLine')
    expect(html).toContain('function splitLongToken')
    expect(html).toContain('termSystem')
    expect(html).toContain('termAssistant')
  })

  test('wraps final-summary bullets and screenshot paths for narrow phones', () => {
    const html = renderMobileServerHtml({
      tokenState: 'provided',
      initialSnapshot: {
        state: 'idle',
        workspace: '/tmp/project',
        model: 'test-model',
        provider: 'local',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            text: [
              'Fresh phone screenshots:',
              '- /tmp/openclaude-mobile-readability-screenshots/after-long-final-bottom.png',
              '- bun test src/commands/server/server.test.ts src/mobileServer/html.test.ts src/mobileServer/server.test.ts',
            ].join('\n'),
          },
        ],
      },
    })

    expect(html).toContain('- /tmp/openclaude-mobile-readability-')
    expect(html).toContain('  screenshots/after-long-final-bottom.png')
    expect(html).toContain('- bun test src/commands/server/server.test.ts')
    expect(html).not.toContain('\n  -\n')
  })

  test('suggests slash commands without opening terminal-only commands', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain('id="suggestions"')
    expect(html).toContain('Command suggestions')
    expect(html).toContain("value: '/dismiss'")
    expect(html).toContain("value: '/clear'")
    expect(html).toContain("value: '/retry'")
    expect(html).toContain("value: '/stop'")
    expect(html).toContain("value: '/model'")
    expect(html).toContain("value: '/provider'")
    expect(html).toContain("value: '/tui'")
    expect(html).toContain("value: '/exit'")
    expect(html).toContain("meta: 'terminal only'")
    expect(html).toContain("meta: 'phone safe'")
    expect(html).toContain("meta: 'phone local'")
    expect(html).toContain("aria-disabled', 'true'")
    expect(html).toContain('terminalOnly')
    expect(html).toContain('phoneSafe')
    expect(html).toContain('phoneLocal')
    expect(html).toContain('let lastSuggestionQuery = null')
    expect(html).toContain('function renderSuggestions()')
    expect(html).toContain("if (query === '' && command.kind === 'terminal') return false")
    expect(html).toContain("const kindClass = command.kind === 'terminal'")
    expect(html).toContain('function acceptSuggestion')
    expect(html).toContain('function runLocalSlashCommand(prompt)')
    expect(html).toContain('function isTerminalOnlyCommand(command)')
    expect(html).toContain('function showTerminalOnlyCommand(command)')
    expect(html).toContain('is not runnable from the phone yet')
    expect(html).toContain('if (isTerminalOnlyCommand(prompt))')
  })

  test('prevents disabled mobile submits before posting to the server', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain('function canSubmitPrompt(snapshot = latestSnapshot)')
    expect(html).toContain('function canStopRun(snapshot = latestSnapshot)')
    expect(html).toContain('function showLocalNotice(text)')
    expect(html).toContain('if (!canSubmitPrompt())')
    expect(html).toContain('if (!canStopRun())')
    expect(html).toContain('promptEl.placeholder = canSubmit')
    expect(html).toContain("'terminal busy'")
    expect(html).toContain("'working'")
    expect(html).toContain('.send:disabled')
    expect(html).toContain('.danger:disabled')
    expect(html).toContain('Phone submit is paused until the local session is idle.')
    expect(html).toContain('A mobile run is already active.')
    expect(html).toContain('Terminal-owned work can only be stopped from the terminal.')
    expect(html).toContain('No mobile-owned run is active.')
  })

  test('keeps token auth available for mobile webviews that strip auth headers', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain('function tokenizedPath(path)')
    expect(html).toContain("!path.startsWith('/global/event')")
    expect(html).toContain("'x-openclaude-mobile': '1'")
    expect(html).toContain('fetch(tokenizedPath(path)')
    expect(html).toContain("history.replaceState(null, '', location.pathname)")
  })

  test('uses OpenCode-style SSE with polling fallback for live updates', () => {
    const html = renderMobileServerHtml()

    expect(html).toContain("new EventSource(tokenizedPath('/global/event'))")
    expect(html).toContain("payload.type === 'server.connected'")
    expect(html).toContain("payload.type === 'snapshot.updated'")
    expect(html).toContain('function startFallbackPolling()')
    expect(html).toContain('function closeEventStream()')
    expect(html).toContain("document.addEventListener('visibilitychange'")
    expect(html).toContain("window.addEventListener('pagehide'")
    expect(html).toContain("window.addEventListener('pageshow'")
    expect(html).toContain('setInterval(poll, 1250)')
  })

  test('renders as a terminal surface with explicit auth recovery', () => {
    const html = renderMobileServerHtml({ tokenState: 'invalid' })

    expect(html).toContain('<title>OpenClaude Mobile</title>')
    expect(html).toContain('apple-mobile-web-app-capable')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('class="topbar"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('id="projectName"')
    expect(html).toContain('id="sessionState"')
    expect(html).toContain('aria-label="Terminal"')
    expect(html).toContain('id="terminalText"')
    expect(html).toContain('OpenClaude mobile')
    expect(html).toContain('function renderTerminal(snapshot)')
    expect(html).toContain('/api/snapshot')
    expect(html).toContain('window.__SAM_TOKEN_STATE__ = "invalid"')
    expect(html).toContain('Token was rejected')
    expect(html).toContain('/server pair')
    expect(html).toContain('/server reset-token')
  })

  test('server-renders an authorized initial snapshot without script injection', () => {
    const html = renderMobileServerHtml({
      tokenState: 'provided',
      initialSnapshot: {
        state: 'idle',
        workspace: '/tmp/project',
        model: 'model</script><script>alert(1)</script>',
        provider: 'local',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            text: 'ready <now>',
          },
        ],
      },
    })

    expect(html).toContain('project')
    expect(html).not.toContain('cwd ~/project')
    expect(html).toContain('model&lt;/script&gt;')
    expect(html).toContain('ready &lt;now&gt;')
    expect(html).toContain('window.__SAM_INITIAL_SNAPSHOT__')
    expect(html).not.toContain('</script><script>alert(1)</script>')
    expect(html).toContain('\\u003c/script>')
  })

  test('can rely on an existing paired-device cookie without a URL token', () => {
    const html = renderMobileServerHtml({ tokenState: 'cookie' })

    expect(html).toContain('window.__SAM_TOKEN_STATE__ = "cookie"')
    expect(html).toContain("initialTokenState !== 'cookie'")
  })

  test('keeps the default action rail to reliable controls only', () => {
    const html = renderMobileServerHtml()

    expect(html).not.toContain('id="models"')
    expect(html).not.toContain("sendCommand('/model')")
    expect(html).toContain('id="retry"')
    expect(html).toContain('clearConfirmUntil')
  })

  test('can nonce inline assets for strict content security policy', () => {
    const html = renderMobileServerHtml({ nonce: 'nonce-test-value' })

    expect(html).toContain('<style nonce="nonce-test-value">')
    expect(html).toContain('<script nonce="nonce-test-value">')
  })
})
