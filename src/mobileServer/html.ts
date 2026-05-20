import type { MobileServerSnapshot } from './server.js'

type RenderOptions = {
  tokenState?: 'missing' | 'provided' | 'cookie' | 'invalid'
  initialSnapshot?: MobileServerSnapshot | null
  nonce?: string
}

export function renderMobileServerHtml({
  tokenState = 'missing',
  initialSnapshot = null,
  nonce,
}: RenderOptions = {}): string {
  const initialProjectName = initialSnapshot
    ? basename(initialSnapshot.workspace) || 'OpenClaude mobile'
    : 'OpenClaude mobile'
  const initialModelName = initialSnapshot
    ? [initialSnapshot.model, initialSnapshot.provider].filter(Boolean).join(' · ') ||
      'live terminal session'
    : 'connecting...'
  const initialState = initialSnapshot?.state ?? 'live'
  const initialDotClass = initialSnapshot?.error
    ? 'error'
    : initialSnapshot?.state === 'idle'
      ? 'ready'
      : ''
  const initialTerminalText = buildInitialTerminalText(initialSnapshot)
  const nonceAttr = nonce ? ` nonce="${escapeHtml(nonce)}"` : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#050506">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="OpenClaude">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>OpenClaude Mobile</title>
  <style${nonceAttr}>
    :root {
      color-scheme: dark;
      --bg: #050506;
      --dock: rgba(5, 5, 6, .96);
      --line: rgba(255,255,255,.095);
      --line-strong: rgba(255,255,255,.16);
      --text: #f1edf7;
      --muted: #9a93a4;
      --dim: #625c69;
      --green: #7ee787;
      --red: #ff6875;
      --amber: #e4cb6e;
      --violet: #b59cff;
      --ink: #061006;
      --touch: 40px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font: 12.5px/1.42 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0;
      -webkit-text-size-adjust: 100%;
    }
    body {
      min-height: 100dvh;
      padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    }
    #terminalShell {
      height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: var(--bg);
    }
    .topbar {
      min-height: 48px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 7px max(11px, env(safe-area-inset-right)) 6px max(11px, env(safe-area-inset-left));
      border-bottom: 1px solid var(--line);
      background: rgba(5,5,6,.96);
    }
    .topTitle {
      min-width: 0;
      display: grid;
      gap: 1px;
    }
    #projectName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 12px;
      font-weight: 820;
    }
    #modelName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--dim);
      font-size: 10.5px;
    }
    .sessionPill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 25px;
      padding: 0 8px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      color: var(--muted);
      font-size: 10px;
      white-space: nowrap;
    }
    #topDot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--amber);
    }
    #topDot.ready { background: var(--green); }
    #topDot.error { background: var(--red); }
    #terminal {
      min-height: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px max(11px, env(safe-area-inset-right)) 16px max(11px, env(safe-area-inset-left));
    }
    #terminalText {
      margin: 0;
      min-height: 100%;
      color: var(--text);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      tab-size: 2;
    }
    .dim { color: var(--dim); }
    .dock {
      background: var(--dock);
      border-top: 1px solid var(--line);
      backdrop-filter: blur(18px) saturate(130%);
      padding-bottom: max(5px, env(safe-area-inset-bottom));
    }
    .promptRow {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: end;
      gap: 8px;
      min-height: 41px;
      padding: 4px max(9px, env(safe-area-inset-right)) 3px max(9px, env(safe-area-inset-left));
      border-bottom: 1px solid var(--line);
    }
    .promptPrefix {
      color: var(--violet);
      font-weight: 850;
      padding-bottom: 8px;
    }
    textarea {
      width: 100%;
      min-height: 34px;
      max-height: 112px;
      resize: none;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      padding: 9px 0 6px;
      font: inherit;
      line-height: 1.42;
    }
    textarea::placeholder { color: var(--dim); }
    .send {
      width: var(--touch);
      min-width: var(--touch);
      height: 36px;
      border: 1px solid rgba(126,231,135,.5);
      border-radius: 5px;
      background: var(--green);
      color: var(--ink);
      font: inherit;
      font-size: 13px;
      font-weight: 900;
    }
    .terminalStatus {
      min-height: 22px;
      display: grid;
      grid-template-columns: auto auto 1fr;
      align-items: center;
      gap: 7px;
      padding: 0 max(9px, env(safe-area-inset-right)) 0 max(9px, env(safe-area-inset-left));
      color: var(--muted);
      font-size: 10.5px;
      border-bottom: 1px solid rgba(255,255,255,.055);
    }
    #statusDot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--amber);
    }
    #statusDot.ready { background: var(--green); }
    #statusDot.error { background: var(--red); }
    #state { color: var(--muted); }
    #meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--dim);
    }
    .rail {
      display: grid;
      gap: 5px;
      padding: 5px max(8px, env(safe-area-inset-right)) 4px max(8px, env(safe-area-inset-left));
    }
    .row {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      min-height: 27px;
    }
    .row::-webkit-scrollbar { display: none; }
    button {
      flex: 0 0 auto;
      height: 34px;
      min-width: 36px;
      border: 1px solid var(--line-strong);
      border-radius: 5px;
      background: rgba(255,255,255,.04);
      color: var(--text);
      padding: 0 7px;
      font: inherit;
      font-size: 10.5px;
      font-weight: 720;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    button:active { transform: translateY(1px); }
    button:disabled {
      opacity: .38;
      transform: none;
    }
    .mod {
      min-width: 58px;
      color: var(--muted);
      background: rgba(255,255,255,.035);
    }
    .mod .sym {
      color: var(--violet);
      margin-right: 2px;
    }
    .active {
      color: var(--ink);
      background: var(--green);
      border-color: var(--green);
    }
    .active .sym { color: var(--ink); }
    .command { color: var(--muted); }
    .danger {
      color: #ffc0c7;
      border-color: rgba(255,104,117,.32);
      background: rgba(255,104,117,.1);
    }
    .iconKey {
      width: 34px;
      min-width: 34px;
      padding: 0;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 390px) {
      html, body { font-size: 12px; }
      .mod { min-width: 53px; }
      button { min-width: 34px; padding: 0 6px; }
      #terminal { padding-top: 10px; }
    }
  </style>
</head>
<body>
  <main id="terminalShell">
    <section class="topbar" aria-label="Session">
      <div class="topTitle">
        <div id="projectName">${escapeHtml(initialProjectName)}</div>
        <div id="modelName">${escapeHtml(initialModelName)}</div>
      </div>
      <div class="sessionPill"><span id="topDot" class="${initialDotClass}"></span><span id="sessionState">${escapeHtml(initialState)}</span></div>
    </section>
    <section id="terminal" aria-label="Terminal">
      <pre id="terminalText">${escapeHtml(initialTerminalText)}</pre>
    </section>
    <section class="dock" aria-label="Mobile terminal controls">
      <div class="promptRow">
        <span class="promptPrefix">›</span>
        <textarea id="prompt" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="type here"></textarea>
        <button id="send" class="send" aria-label="Send">↵</button>
      </div>
      <div class="terminalStatus" aria-live="polite"><span id="statusDot"></span><span id="state">link</span><span id="meta">connecting...</span></div>
      <div class="rail">
        <div class="row" aria-label="Modifier keys">
          <button class="mod" data-mod="shift"><span class="sym">⇧</span>shift</button>
          <button class="mod" data-mod="cmd"><span class="sym">⌘</span>cmd</button>
          <button class="mod" data-mod="alt"><span class="sym">⌥</span>alt</button>
          <button class="mod" data-mod="ctrl"><span class="sym">⌃</span>ctrl</button>
          <button id="retry" class="command">retry</button>
          <button id="stop" class="danger">stop</button>
          <button id="clear" class="command">clear</button>
        </div>
        <div class="row" aria-label="Control keys">
          <button data-key="esc">esc</button>
          <button data-key="tab">tab</button>
          <button data-key="slash">/</button>
          <button data-key="c">c</button>
          <button data-key="d">d</button>
          <button data-key="tilde">~</button>
          <button data-key="pipe">|</button>
          <button data-key="left" class="iconKey">←</button>
          <button data-key="right" class="iconKey">→</button>
          <button data-key="up" class="iconKey">↑</button>
          <button data-key="down" class="iconKey">↓</button>
          <button data-key="enter">enter</button>
        </div>
      </div>
    </section>
  </main>
  <script${nonceAttr}>
    window.__SAM_TOKEN_STATE__ = ${JSON.stringify(tokenState)};
    window.__SAM_INITIAL_SNAPSHOT__ = ${safeScriptJson(initialSnapshot)};
    const initialTokenState = window.__SAM_TOKEN_STATE__;
    const initialSnapshot = window.__SAM_INITIAL_SNAPSHOT__;
    const params = new URLSearchParams(location.search);
    const urlToken = initialTokenState === 'provided' ? params.get('token') || '' : '';
    if (urlToken) {
      sessionStorage.setItem('samServerToken', urlToken);
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    }
    if (initialTokenState === 'invalid') sessionStorage.removeItem('samServerToken');
    let token = urlToken || (initialTokenState === 'cookie' ? '' : sessionStorage.getItem('samServerToken') || '');

    const promptEl = document.getElementById('prompt');
    const terminalEl = document.getElementById('terminal');
    const terminalTextEl = document.getElementById('terminalText');
    const metaEl = document.getElementById('meta');
    const stateEl = document.getElementById('state');
    const dotEl = document.getElementById('statusDot');
    const topDotEl = document.getElementById('topDot');
    const projectNameEl = document.getElementById('projectName');
    const modelNameEl = document.getElementById('modelName');
    const sessionStateEl = document.getElementById('sessionState');
    const sendButton = document.getElementById('send');
    const stopButton = document.getElementById('stop');
    const mods = { shift: false, cmd: false, alt: false, ctrl: false };
    let localTurns = [];
    let promptHistory = [];
    let promptHistoryIndex = -1;
    let eventSource = null;
    let fallbackPollInterval = null;
    let lastEventAt = 0;
    let latestSnapshot = initialSnapshot || { state: 'starting' };
    let clearConfirmUntil = 0;
    let reconnectNoticeShown = false;
    let justPaired = !!urlToken;

    function authHeaders(extra = {}) {
      const headers = { ...extra, 'x-openclaude-mobile': '1' };
      return token ? { ...headers, authorization: 'Bearer ' + token } : headers;
    }
    function tokenizedPath(path) {
      if (!token || !path.startsWith('/global/event')) return path;
      const joiner = path.includes('?') ? '&' : '?';
      return path + joiner + 'token=' + encodeURIComponent(token);
    }
    async function api(path, options = {}) {
      const response = await fetch(tokenizedPath(path), {
        ...options,
        headers: authHeaders({ 'content-type': 'application/json', ...(options.headers || {}) }),
      });
      const text = await response.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text }; }
      if (!response.ok) {
        const error = new Error(json.error || response.statusText);
        error.status = response.status;
        throw error;
      }
      return json;
    }
    function cleanText(value) {
      return String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').trim();
    }
    function prefixBlock(prefix, text) {
      const cleaned = cleanText(text);
      if (!cleaned) return '';
      const lines = cleaned.split('\\n');
      return [prefix + lines[0], ...lines.slice(1).map(line => '  ' + line)].join('\\n');
    }
    function turnText(turn) {
      if (turn.role === 'user') return prefixBlock('› ', turn.text);
      if (turn.role === 'system') return prefixBlock('! ', turn.text);
      return prefixBlock('  ', turn.text);
    }
    function terminalHeader(snapshot) {
      const lines = ['OpenClaude mobile'];
      const modelLine = [snapshot.model, snapshot.provider].filter(Boolean).join(' · ');
      if (modelLine) lines.push(modelLine);
      if (snapshot.workspace) lines.push(snapshot.workspace);
      return lines;
    }
    function setTerminalText(lines) {
      terminalTextEl.textContent = lines.filter(line => line !== null && line !== undefined).join('\\n');
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
    function renderTerminal(snapshot) {
      const remote = Array.isArray(snapshot.messages) ? snapshot.messages : [];
      const turns = remote.length ? remote : localTurns;
      const lines = terminalHeader(snapshot);
      lines.push('');
      if (!turns.length && !snapshot.lastResponse) {
        lines.push('› mobile session ready');
        lines.push(snapshot.busyOwner === 'terminal' ? '  terminal is working' : '  waiting for input');
      } else {
        for (const turn of turns) {
          const rendered = turnText(turn);
          if (rendered) {
            lines.push(rendered);
            lines.push('');
          }
        }
        if (!remote.length && snapshot.lastResponse) {
          lines.push(turnText({ role: 'assistant', text: snapshot.lastResponse }));
          lines.push('');
        }
      }
      if (snapshot.state === 'busy' || snapshot.activeRunId) {
        lines.push(snapshot.busyOwner === 'terminal' ? '  terminal is working...' : '  working...');
      }
      setTerminalText(lines);
    }
    function explainAuthError() {
      setTerminalText([
        'OpenClaude mobile',
        '',
        '! Unauthorized',
        '',
        'Token was rejected or missing.',
        'Run /server pair, open the full Phone URL once on this device, then bookmark the bare URL.',
        'Use /server reset-token if the token is stale.',
      ]);
      stateEl.textContent = 'auth';
      dotEl.className = 'error';
      topDotEl.className = 'error';
      sessionStateEl.textContent = 'auth';
      metaEl.textContent = 'token required';
    }
    function resetMomentaryMods() {
      for (const key of Object.keys(mods)) mods[key] = false;
      renderMods();
    }
    function renderMods() {
      document.querySelectorAll('[data-mod]').forEach((button) => {
        button.classList.toggle('active', !!mods[button.dataset.mod]);
      });
    }
    function insertText(text) {
      const start = promptEl.selectionStart || 0;
      const end = promptEl.selectionEnd || 0;
      promptEl.value = promptEl.value.slice(0, start) + text + promptEl.value.slice(end);
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = start + text.length;
      resizePrompt();
    }
    function moveCaret(delta) {
      const next = Math.max(0, Math.min(promptEl.value.length, (promptEl.selectionStart || 0) + delta));
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = next;
    }
    function showPromptHistory(delta) {
      if (!promptHistory.length) return;
      if (promptHistoryIndex < 0) promptHistoryIndex = promptHistory.length;
      promptHistoryIndex = Math.max(0, Math.min(promptHistory.length, promptHistoryIndex + delta));
      promptEl.value = promptHistoryIndex >= promptHistory.length ? '' : promptHistory[promptHistoryIndex];
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = promptEl.value.length;
      resizePrompt();
    }
    function resizePrompt() {
      promptEl.style.height = '0px';
      promptEl.style.height = Math.min(promptEl.scrollHeight, 112) + 'px';
    }
    function updateControls(snapshot = latestSnapshot) {
      const busy = snapshot && (snapshot.state === 'busy' || snapshot.activeRunId);
      const canSubmit = typeof snapshot?.canSubmit === 'boolean' ? snapshot.canSubmit : !busy;
      const canStop = typeof snapshot?.canStop === 'boolean' ? snapshot.canStop : !!snapshot?.activeRunId;
      sendButton.disabled = !canSubmit || promptEl.value.trim().length === 0;
      stopButton.disabled = !canStop;
    }
    async function submitPrompt(value = promptEl.value) {
      const prompt = value.trim();
      if (!prompt) return;
      promptHistory.push(prompt);
      promptHistory = promptHistory.slice(-50);
      promptHistoryIndex = -1;
      localTurns.push({ id: 'local-' + Date.now(), role: 'user', text: prompt });
      applySnapshot({ ...latestSnapshot, state: 'busy', messages: localTurns });
      await api('/api/message', { method: 'POST', body: JSON.stringify({ prompt }) });
      promptEl.value = '';
      resizePrompt();
      updateControls();
      resetMomentaryMods();
      await poll();
    }
    async function sendCommand(command) {
      promptEl.value = '';
      await submitPrompt(command);
    }
    async function stopRun() {
      await api('/api/stop', { method: 'POST', body: '{}' });
      resetMomentaryMods();
      await poll();
    }
    function handleVirtualKey(key) {
      if (mods.ctrl && (key === 'c' || key === 'd' || key === 'esc')) return stopRun();
      if (mods.cmd && mods.shift && key === 'slash') {
        promptEl.value = '/';
        promptEl.focus();
        resetMomentaryMods();
        return;
      }
      if (mods.cmd && key === 'slash') {
        promptEl.value = '';
        promptEl.focus();
        resetMomentaryMods();
        return;
      }
      if (key === 'esc') return sendCommand('/dismiss');
      if (key === 'tab') return insertText('\\t');
      if (key === 'slash') return insertText('/');
      if (key === 'c') return mods.ctrl ? stopRun() : insertText('c');
      if (key === 'd') return mods.ctrl ? stopRun() : insertText('d');
      if (key === 'tilde') return insertText('~');
      if (key === 'pipe') return insertText('|');
      if (key === 'left') {
        moveCaret(-1);
        resetMomentaryMods();
        return;
      }
      if (key === 'right') {
        moveCaret(1);
        resetMomentaryMods();
        return;
      }
      if (key === 'up') {
        showPromptHistory(-1);
        resetMomentaryMods();
        return;
      }
      if (key === 'down') {
        showPromptHistory(1);
        resetMomentaryMods();
        return;
      }
      if (key === 'enter') {
        if (mods.shift || mods.alt) {
          insertText('\\n');
          resetMomentaryMods();
          return;
        }
        return submitPrompt();
      }
      promptEl.focus();
    }
    function handleActionError(error) {
      if (error.status === 401) explainAuthError();
      else {
        localTurns.push({ id: 'error-' + Date.now(), role: 'system', text: error.message || String(error) });
        renderTerminal({ state: 'idle', messages: localTurns });
      }
    }
    document.querySelectorAll('[data-mod]').forEach((button) => {
      button.addEventListener('click', () => {
        mods[button.dataset.mod] = !mods[button.dataset.mod];
        renderMods();
      });
    });
    document.querySelectorAll('[data-key]').forEach((button) => {
      button.addEventListener('click', () => {
        Promise.resolve(handleVirtualKey(button.dataset.key)).catch(handleActionError);
      });
    });
    document.getElementById('send').addEventListener('click', () => submitPrompt().catch(handleActionError));
    document.getElementById('stop').addEventListener('click', () => stopRun().catch(handleActionError));
    document.getElementById('clear').addEventListener('click', () => {
      const now = Date.now();
      const clearButton = document.getElementById('clear');
      if (now > clearConfirmUntil) {
        clearConfirmUntil = now + 1600;
        clearButton.textContent = 'clear?';
        setTimeout(() => {
          if (Date.now() > clearConfirmUntil) clearButton.textContent = 'clear';
        }, 1700);
        return;
      }
      localTurns = [];
      clearConfirmUntil = 0;
      clearButton.textContent = 'clear';
      renderTerminal({ state: 'idle', messages: [] });
    });
    document.getElementById('retry').addEventListener('click', () => {
      reconnectNoticeShown = false;
      poll();
      connectEventStream();
    });
    promptEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        submitPrompt().catch(handleActionError);
      }
    });
    promptEl.addEventListener('input', resizePrompt);
    promptEl.addEventListener('input', () => updateControls());
    resizePrompt();
    updateControls();
    async function poll() {
      if (!token && initialTokenState !== 'cookie') {
        explainAuthError();
        return;
      }
      try {
        const snapshot = await api('/api/snapshot');
        applySnapshot(snapshot);
      } catch (error) {
        if (error.status === 401) {
          sessionStorage.removeItem('samServerToken');
          explainAuthError();
          return;
        }
        stateEl.textContent = 'error';
        dotEl.className = 'error';
        topDotEl.className = 'error';
        sessionStateEl.textContent = 'offline';
        metaEl.textContent = error.message || 'reconnecting...';
        if (!reconnectNoticeShown) {
          reconnectNoticeShown = true;
          renderTerminal({
            ...latestSnapshot,
            state: 'stopped',
            messages: [
              {
                id: 'connection-error',
                role: 'system',
                text: 'Connection interrupted. Reconnecting in the background.',
              },
            ],
          });
        }
      }
    }
    function applySnapshot(snapshot) {
      latestSnapshot = snapshot;
      reconnectNoticeShown = false;
      stateEl.textContent = snapshot.state || 'unknown';
      dotEl.className = snapshot.error ? 'error' : snapshot.state === 'idle' ? 'ready' : '';
      topDotEl.className = dotEl.className;
      sessionStateEl.textContent = snapshot.state || 'live';
      projectNameEl.textContent = basename(snapshot.workspace) || 'OpenClaude mobile';
      const meta = [
        snapshot.model || null,
        snapshot.provider || null,
        snapshot.workspace || null,
      ].filter(Boolean).join(' · ');
      modelNameEl.textContent = [snapshot.model || null, snapshot.provider || null].filter(Boolean).join(' · ') || 'live terminal session';
      metaEl.textContent = meta || 'connected';
      renderTerminal(snapshot);
      if (justPaired) {
        justPaired = false;
        metaEl.textContent = 'paired - bookmark this page';
      }
      updateControls(snapshot);
    }
    function basename(value) {
      const text = String(value || '').replace(/\\/+$|\\\\+$/g, '');
      const parts = text.split(/[\\\\/]/).filter(Boolean);
      return parts[parts.length - 1] || text;
    }
    function startFallbackPolling() {
      if (fallbackPollInterval) return;
      fallbackPollInterval = setInterval(poll, 1250);
    }
    function stopFallbackPolling() {
      if (!fallbackPollInterval) return;
      clearInterval(fallbackPollInterval);
      fallbackPollInterval = null;
    }
    function connectEventStream() {
      if (!('EventSource' in window) || (!token && initialTokenState !== 'cookie')) {
        startFallbackPolling();
        return;
      }
      closeEventStream();
      eventSource = new EventSource(tokenizedPath('/global/event'));
      eventSource.onmessage = (event) => {
        lastEventAt = Date.now();
        stopFallbackPolling();
        let envelope = null;
        try { envelope = JSON.parse(event.data); } catch { return; }
        const payload = envelope && envelope.payload;
        if (!payload) return;
        if (payload.type === 'server.connected') {
          stateEl.textContent = 'link';
          dotEl.className = '';
          metaEl.textContent = 'connected';
          return;
        }
        if (payload.type === 'snapshot.updated' && payload.properties && payload.properties.snapshot) {
          applySnapshot(payload.properties.snapshot);
        }
      };
      eventSource.onerror = () => {
        if (Date.now() - lastEventAt > 2000) startFallbackPolling();
      };
    }
    function closeEventStream() {
      if (!eventSource) return;
      eventSource.close();
      eventSource = null;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        closeEventStream();
        stopFallbackPolling();
        return;
      }
      poll();
      connectEventStream();
    });
    window.addEventListener('pagehide', () => {
      closeEventStream();
      stopFallbackPolling();
    });
    window.addEventListener('pageshow', () => {
      poll();
      connectEventStream();
    });
    if (initialSnapshot) applySnapshot(initialSnapshot);
    poll();
    connectEventStream();
  </script>
</body>
</html>`;
}

function buildInitialTerminalText(snapshot: MobileServerSnapshot | null): string {
  if (!snapshot) {
    return ['OpenClaude mobile', '', '› connecting to live session'].join('\n')
  }

  const lines = ['OpenClaude mobile']
  const modelLine = [snapshot.model, snapshot.provider].filter(Boolean).join(' · ')
  if (modelLine) lines.push(modelLine)
  if (snapshot.workspace) lines.push(snapshot.workspace)
  lines.push('')

  const turns = snapshot.messages ?? []
  if (turns.length === 0 && !snapshot.lastResponse) {
    lines.push('› mobile session ready')
    lines.push('  waiting for input')
  } else {
    for (const turn of turns.slice(-12)) {
      const prefix = turn.role === 'user' ? '› ' : turn.role === 'system' ? '! ' : '  '
      const text = turn.text.trim()
      if (!text) continue
      lines.push(`${prefix}${text}`)
      lines.push('')
    }
    if (turns.length === 0 && snapshot.lastResponse) {
      lines.push(`  ${snapshot.lastResponse.trim()}`)
    }
  }

  if (snapshot.state === 'busy' || snapshot.activeRunId) {
    lines.push('  working...')
  }
  return lines.join('\n')
}

function basename(value: string): string {
  const text = String(value || '').replace(/[\\/]+$/g, '')
  const parts = text.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || text
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
