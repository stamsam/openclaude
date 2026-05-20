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
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
  <meta name="theme-color" content="#050506">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="OpenClaude">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>OpenClaude Mobile</title>
  <style${nonceAttr}>
    :root {
      color-scheme: dark;
      --bg: #060607;
      --panel: #0b0b0d;
      --panel-strong: #111114;
      --dock: rgba(8, 8, 10, .98);
      --line: rgba(255,255,255,.08);
      --line-strong: rgba(255,255,255,.15);
      --text: #f4f1f8;
      --muted: #a09aa8;
      --dim: #686170;
      --green: #7ee787;
      --red: #ff6875;
      --amber: #e4cb6e;
      --violet: #b59cff;
      --cyan: #75d7ff;
      --ink: #061006;
      --touch: 40px;
      --app-height: 100dvh;
      --terminal-bottom-pad: 58px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font: 12.75px/1.42 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0;
      -webkit-text-size-adjust: 100%;
    }
    body {
      height: var(--app-height);
      width: 100vw;
      max-width: 100vw;
      position: fixed;
      inset: 0;
      padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
      overscroll-behavior: none;
      background:
        linear-gradient(180deg, rgba(255,255,255,.035), transparent 52px),
        var(--bg);
    }
    #terminalShell {
      height: calc(var(--app-height) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      min-width: 0;
      max-width: 100vw;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: var(--bg);
    }
    .topbar {
      min-width: 0;
      width: 100%;
      max-width: 100vw;
      min-height: 50px;
      display: flex;
      align-items: center;
      padding: 8px max(12px, env(safe-area-inset-right)) 7px max(12px, env(safe-area-inset-left));
      border-bottom: 1px solid var(--line);
      background: rgba(8,8,10,.98);
    }
    .topTitle {
      flex: 1 1 auto;
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .brandRow {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brandMark {
      width: 17px;
      height: 17px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(126,231,135,.4);
      border-radius: 5px;
      color: var(--green);
      background: rgba(126,231,135,.075);
      font-weight: 900;
    }
    #projectName {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 12.5px;
      font-weight: 820;
    }
    #modelName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--dim);
      font-size: 10.25px;
    }
    .topState {
      flex: 0 0 auto;
      color: var(--muted);
      font-size: 10px;
      font-weight: 720;
      white-space: nowrap;
    }
    .topState::before {
      content: "/";
      color: var(--dim);
      margin: 0 4px 0 2px;
    }
    .sessionPill {
      display: none;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #topDot {
      flex: 0 0 auto;
      margin-left: 8px;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--amber);
    }
    #topDot.ready { background: var(--green); }
    #topDot.error { background: var(--red); }
    #terminal {
      min-width: 0;
      max-width: 100vw;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 14px max(12px, env(safe-area-inset-right)) max(var(--terminal-bottom-pad), env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
      scroll-padding-bottom: max(var(--terminal-bottom-pad), env(safe-area-inset-bottom));
      background:
        repeating-linear-gradient(180deg, rgba(255,255,255,.018) 0, rgba(255,255,255,.018) 1px, transparent 1px, transparent 28px),
        var(--bg);
    }
    #terminalText {
      margin: 0;
      min-width: 0;
      width: 100%;
      max-width: 100%;
      min-height: 100%;
      color: var(--text);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      tab-size: 2;
      font-size: 13.25px;
      line-height: 1.52;
    }
    .termLine {
      min-height: 1.52em;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .termHeader {
      color: var(--text);
      font-weight: 780;
    }
    .termDim { color: var(--dim); }
    .termSystem { color: var(--amber); }
    .termUser {
      color: var(--text);
      font-weight: 760;
    }
    .termAssistant { color: #e8e4ed; }
    .dim { color: var(--dim); }
    .dock {
      min-width: 0;
      width: 100%;
      max-width: 100vw;
      overflow: hidden;
      background: var(--dock);
      border-top: 1px solid var(--line);
      backdrop-filter: blur(18px) saturate(130%);
      display: grid;
      gap: 5px;
      padding: 6px 0 max(6px, env(safe-area-inset-bottom));
    }
    .promptRow {
      min-width: 0;
      width: auto;
      max-width: none;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      margin: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
      padding: 4px 5px 4px 9px;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      background: var(--panel-strong);
    }
    .promptPrefix {
      color: var(--violet);
      font-weight: 850;
      align-self: center;
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
      padding: 8px 0 6px;
      font: inherit;
      font-size: 16px;
      line-height: 1.42;
    }
    textarea::placeholder { color: var(--dim); }
    .suggestions {
      min-width: 0;
      max-width: 100vw;
      display: none;
      gap: 5px;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
    }
    .suggestions::-webkit-scrollbar { display: none; }
    body.suggesting .suggestions {
      display: flex;
    }
    .suggestion {
      height: 32px;
      min-width: 84px;
      max-width: 150px;
      display: inline-grid;
      align-content: center;
      gap: 1px;
      text-align: left;
      padding: 0 8px;
      border-color: rgba(181,156,255,.2);
      background: rgba(181,156,255,.07);
    }
    .suggestion.phoneSafe {
      border-color: rgba(126,231,135,.24);
      background: rgba(126,231,135,.065);
    }
    .suggestion.phoneLocal {
      border-color: rgba(117,215,255,.22);
      background: rgba(117,215,255,.06);
    }
    .suggestion.terminalOnly {
      color: var(--muted);
      border-color: rgba(255,255,255,.14);
      background: rgba(255,255,255,.055);
    }
    .suggestion.terminalOnly[aria-selected="true"] {
      color: var(--muted);
      border-color: rgba(255,255,255,.18);
      background: rgba(255,255,255,.07);
    }
    .suggestion[aria-selected="true"] {
      color: var(--ink);
      border-color: var(--green);
      background: var(--green);
    }
    .suggestionName,
    .suggestionMeta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .suggestionName {
      color: inherit;
      font-size: 10.5px;
      font-weight: 820;
    }
    .suggestionMeta {
      color: var(--dim);
      font-size: 8.75px;
      font-weight: 680;
    }
    .suggestion[aria-selected="true"] .suggestionMeta {
      color: rgba(6,16,6,.7);
    }
    .send {
      width: var(--touch);
      min-width: var(--touch);
      height: 38px;
      border: 1px solid rgba(126,231,135,.5);
      border-radius: 5px;
      background: var(--green);
      color: var(--ink);
      font: inherit;
      font-size: 13px;
      font-weight: 900;
    }
    .send:disabled {
      opacity: 1;
      border-color: rgba(255,255,255,.11);
      background: rgba(126,231,135,.22);
      color: rgba(6,16,6,.55);
    }
    .terminalStatus {
      min-width: 0;
      max-width: 100%;
      min-height: 20px;
      display: grid;
      grid-template-columns: auto auto 1fr;
      align-items: center;
      gap: 7px;
      padding: 0 max(11px, env(safe-area-inset-right)) 0 max(11px, env(safe-area-inset-left));
      color: var(--muted);
      font-size: 10.5px;
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
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      display: grid;
      gap: 4px;
      padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
    }
    .row {
      min-width: 0;
      width: 100%;
      max-width: 100%;
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      min-height: 36px;
    }
    .actionRow {
      justify-content: flex-start;
      min-height: 32px;
    }
    .row::-webkit-scrollbar { display: none; }
    button {
      flex: 0 0 auto;
      height: 36px;
      min-width: 36px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 5px;
      background: rgba(255,255,255,.045);
      color: var(--text);
      padding: 0 7px;
      font: inherit;
      font-size: 10px;
      font-weight: 720;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
    }
    button:active { transform: translateY(1px); }
    button:disabled {
      opacity: .38;
      transform: none;
    }
    .mod {
      min-width: 55px;
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
      box-shadow: none;
    }
    .active .sym { color: var(--ink); }
    .command {
      height: 32px;
      color: var(--cyan);
      background: rgba(117,215,255,.055);
    }
    .danger {
      color: #ffc0c7;
      border-color: rgba(255,104,117,.32);
      background: rgba(255,104,117,.1);
    }
    .danger:disabled {
      opacity: 1;
      color: rgba(255,192,199,.38);
      border-color: rgba(255,104,117,.16);
      background: rgba(255,104,117,.035);
    }
    .iconKey {
      width: 36px;
      min-width: 36px;
      padding: 0;
      color: var(--muted);
      font-size: 13px;
    }
    body.typing .rail {
      display: none;
    }
    body.typing .dock {
      gap: 4px;
      padding-bottom: max(8px, env(safe-area-inset-bottom));
    }
    body.typing #terminal {
      padding-bottom: max(48px, env(safe-area-inset-bottom));
      scroll-padding-bottom: max(64px, env(safe-area-inset-bottom));
    }
    @media (max-width: 390px) {
      html, body { font-size: 12.25px; }
      #terminalText { font-size: 13px; }
      textarea { font-size: 16px; }
      .mod { min-width: 51px; }
      button { min-width: 35px; padding: 0 6px; }
      #terminal { padding-top: 10px; }
      .suggestion { min-width: 78px; }
    }
  </style>
</head>
<body>
  <main id="terminalShell">
    <section class="topbar" aria-label="Session">
      <div class="topTitle">
        <div class="brandRow"><span class="brandMark">›</span><div id="projectName">${escapeHtml(initialProjectName)}</div><span id="sessionState" class="topState">${escapeHtml(initialState)}</span></div>
        <div id="modelName">${escapeHtml(initialModelName)}</div>
      </div>
      <span id="topDot" class="${initialDotClass}" aria-hidden="true"></span>
    </section>
    <section id="terminal" aria-label="Terminal">
      <div id="terminalText">${escapeHtml(initialTerminalText)}</div>
    </section>
    <section class="dock" aria-label="Mobile terminal controls">
      <div class="promptRow">
        <span class="promptPrefix">›</span>
        <textarea id="prompt" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="type here"></textarea>
        <button id="send" class="send" aria-label="Send">↵</button>
      </div>
      <div id="suggestions" class="suggestions" aria-label="Command suggestions"></div>
      <div class="terminalStatus" aria-live="polite"><span id="statusDot"></span><span id="state">link</span><span id="meta">connecting...</span></div>
      <div class="rail">
        <div class="row actionRow" aria-label="Actions">
          <button id="retry" class="command">retry</button>
          <button id="stop" class="danger">stop</button>
          <button id="clear" class="command">clear</button>
        </div>
        <div class="row" aria-label="Modifier keys">
          <button class="mod" data-mod="shift"><span class="sym">⇧</span>shift</button>
          <button class="mod" data-mod="cmd"><span class="sym">⌘</span>cmd</button>
          <button class="mod" data-mod="alt"><span class="sym">⌥</span>alt</button>
          <button class="mod" data-mod="ctrl"><span class="sym">⌃</span>ctrl</button>
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
    const suggestionsEl = document.getElementById('suggestions');
    const mods = { shift: false, cmd: false, alt: false, ctrl: false };
    const commandSuggestions = [
      { value: '/dismiss', name: '/dismiss', meta: 'phone safe', kind: 'mobile' },
      { value: '/clear', name: '/clear', meta: 'phone local', kind: 'local' },
      { value: '/retry', name: '/retry', meta: 'phone local', kind: 'local' },
      { value: '/stop', name: '/stop', meta: 'phone safe', kind: 'mobile' },
      { value: '/model', name: '/model', meta: 'terminal only', kind: 'terminal' },
      { value: '/provider', name: '/provider', meta: 'terminal only', kind: 'terminal' },
      { value: '/tui', name: '/tui', meta: 'terminal only', kind: 'terminal' },
      { value: '/server', name: '/server', meta: 'terminal only', kind: 'terminal' },
      { value: '/exit', name: '/exit', meta: 'terminal only', kind: 'terminal' },
    ];
    let localTurns = [];
    let promptHistory = [];
    let promptHistoryIndex = -1;
    let visibleSuggestions = [];
    let selectedSuggestionIndex = 0;
    let lastSuggestionQuery = null;
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
      const wrapped = cleaned.split('\\n').flatMap(line => wrapTerminalLine(line));
      return [prefix + wrapped[0], ...wrapped.slice(1).map(line => '  ' + line)].join('\\n');
    }
    function wrapTerminalLine(line) {
      const limit = 42;
      const text = String(line || '');
      const bullet = text.match(/^(\\s*[-*]\\s+)(.+)$/);
      const prefix = bullet ? bullet[1] : '';
      const continuationPrefix = bullet ? ' '.repeat(prefix.length) : '';
      const words = (bullet ? bullet[2] : text).split(/\\s+/).filter(Boolean);
      if (!words.length) return [''];
      const lines = [];
      let current = prefix;
      const availableLimit = Math.max(18, limit - prefix.length);
      for (const word of words) {
        const chunks = splitLongToken(word, availableLimit);
        for (const chunk of chunks) {
          const lineLimit = current.trim().length === 0 ? availableLimit : limit;
          if (chunk.length > lineLimit) {
            if (current.trim()) {
              lines.push(current);
              current = continuationPrefix;
            }
            lines.push(continuationPrefix + chunk);
            continue;
          }
          const separator = current.trim().length > 0 && !current.endsWith(' ') ? ' ' : '';
          const next = current + separator + chunk;
          if (next.length > lineLimit && current.trim()) {
            lines.push(current);
            current = continuationPrefix + chunk;
          } else {
            current = next;
          }
        }
      }
      if (current.trim()) lines.push(current);
      return lines;
    }
    function splitLongToken(token, limit) {
      const chunks = [];
      let remaining = String(token || '');
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit + 1);
        const cuts = ['/', '-', '_', '.', ':'].map(separator => window.lastIndexOf(separator));
        let cut = Math.max(...cuts);
        if (cut < Math.floor(limit * 0.55)) cut = limit;
        else cut += 1;
        chunks.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
      }
      if (remaining) chunks.push(remaining);
      return chunks;
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
      if (snapshot.workspace) lines.push('cwd ' + compactWorkspace(snapshot.workspace));
      return lines;
    }
    function setTerminalText(lines) {
      terminalTextEl.textContent = lines.filter(line => line !== null && line !== undefined).join('\\n');
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
    function setTerminalRows(rows) {
      terminalTextEl.replaceChildren(...rows.map(row => {
        const line = document.createElement('div');
        line.className = 'termLine ' + row.kind;
        line.textContent = row.text || '\\u00a0';
        return line;
      }));
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
    function pushTerminalBlock(rows, kind, prefix, text) {
      const cleaned = cleanText(text);
      if (!cleaned) return;
      const wrapped = cleaned.split('\\n').flatMap(line => wrapTerminalLine(line));
      rows.push({ kind, text: prefix + wrapped[0] });
      for (const line of wrapped.slice(1)) rows.push({ kind, text: '  ' + line });
      rows.push({ kind: 'termDim', text: '' });
    }
    function renderTerminal(snapshot) {
      const remote = Array.isArray(snapshot.messages) ? snapshot.messages : [];
      const turns = remote.length ? remote : localTurns;
      const rows = [];
      if (!turns.length && !snapshot.lastResponse) {
        rows.push({ kind: 'termUser', text: '› mobile session ready' });
        rows.push({
          kind: 'termAssistant',
          text: snapshot.busyOwner === 'terminal'
            ? '  terminal is working'
            : '  waiting for input',
        });
      } else {
        for (const turn of turns) {
          if (turn.role === 'user') pushTerminalBlock(rows, 'termUser', '› ', turn.text);
          else if (turn.role === 'system') pushTerminalBlock(rows, 'termSystem', '! ', turn.text);
          else pushTerminalBlock(rows, 'termAssistant', '  ', turn.text);
        }
        if (!remote.length && snapshot.lastResponse) {
          pushTerminalBlock(rows, 'termAssistant', '  ', snapshot.lastResponse);
        }
      }
      if (snapshot.state === 'busy' || snapshot.activeRunId) {
        rows.push({
          kind: 'termAssistant',
          text: snapshot.busyOwner === 'terminal' ? '  terminal is working...' : '  working...',
        });
      }
      setTerminalRows(rows);
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
    function slashCommandQuery() {
      const value = promptEl.value.trimStart();
      if (!value.startsWith('/') || /\\s/.test(value)) return null;
      return value.slice(1).toLowerCase();
    }
    function setPromptValue(value) {
      promptEl.value = value;
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = promptEl.value.length;
      resizePrompt();
      updateControls();
      renderSuggestions();
      syncViewportHeight();
    }
    function renderSuggestions() {
      const query = slashCommandQuery();
      if (query !== lastSuggestionQuery) {
        selectedSuggestionIndex = 0;
        lastSuggestionQuery = query;
      }
      visibleSuggestions = query === null
        ? []
        : commandSuggestions
          .filter(command => {
            if (query === '' && command.kind === 'terminal') return false;
            return command.value.slice(1).startsWith(query);
          })
          .slice(0, 5);
      selectedSuggestionIndex = Math.min(selectedSuggestionIndex, Math.max(visibleSuggestions.length - 1, 0));
      document.body.classList.toggle('suggesting', visibleSuggestions.length > 0);
      suggestionsEl.replaceChildren(...visibleSuggestions.map((command, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        const kindClass = command.kind === 'terminal'
          ? 'terminalOnly'
          : command.kind === 'local'
            ? 'phoneLocal'
            : 'phoneSafe';
        button.className = 'suggestion ' + kindClass;
        button.setAttribute('aria-selected', index === selectedSuggestionIndex ? 'true' : 'false');
        if (command.kind === 'terminal') button.setAttribute('aria-disabled', 'true');
        button.title = command.kind === 'terminal'
          ? command.name + ' is available from the terminal, not the phone yet'
          : command.name;
        const name = document.createElement('span');
        name.className = 'suggestionName';
        name.textContent = command.name;
        const meta = document.createElement('span');
        meta.className = 'suggestionMeta';
        meta.textContent = command.meta;
        button.append(name, meta);
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.addEventListener('click', () => acceptSuggestion(index));
        return button;
      }));
    }
    function acceptSuggestion(index = selectedSuggestionIndex) {
      const command = visibleSuggestions[index];
      if (!command) return false;
      if (command.kind === 'terminal') {
        showTerminalOnlyCommand(command.value);
        return false;
      }
      setPromptValue(command.value);
      return true;
    }
    function insertText(text) {
      const start = promptEl.selectionStart || 0;
      const end = promptEl.selectionEnd || 0;
      promptEl.value = promptEl.value.slice(0, start) + text + promptEl.value.slice(end);
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = start + text.length;
      resizePrompt();
      updateControls();
      renderSuggestions();
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
      updateControls();
      renderSuggestions();
    }
    function resizePrompt() {
      promptEl.style.height = '0px';
      promptEl.style.height = Math.min(promptEl.scrollHeight, 112) + 'px';
    }
    function syncViewportHeight() {
      const viewport = window.visualViewport;
      const height = Math.floor(viewport ? viewport.height : window.innerHeight);
      if (height > 0) {
        document.documentElement.style.setProperty('--app-height', height + 'px');
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.activeElement === promptEl) {
        requestAnimationFrame(() => {
          terminalEl.scrollTop = terminalEl.scrollHeight;
          promptEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      }
    }
    function setTypingMode(active) {
      document.body.classList.toggle('typing', active);
      syncViewportHeight();
    }
    function updateControls(snapshot = latestSnapshot) {
      const canSubmit = canSubmitPrompt(snapshot);
      const canStop = canStopRun(snapshot);
      sendButton.disabled = !canSubmit || promptEl.value.trim().length === 0;
      stopButton.disabled = !canStop;
      promptEl.placeholder = canSubmit
        ? 'type here'
        : snapshot?.busyOwner === 'terminal'
          ? 'terminal busy'
          : 'working';
    }
    function canSubmitPrompt(snapshot = latestSnapshot) {
      const busy = snapshot && (snapshot.state === 'busy' || snapshot.activeRunId);
      return typeof snapshot?.canSubmit === 'boolean' ? snapshot.canSubmit : !busy;
    }
    function canStopRun(snapshot = latestSnapshot) {
      return typeof snapshot?.canStop === 'boolean' ? snapshot.canStop : !!snapshot?.activeRunId;
    }
    async function runLocalSlashCommand(prompt) {
      const command = prompt.trim().toLowerCase();
      if (command === '/clear') {
        localTurns = [];
        renderTerminal({ state: 'idle', messages: [] });
        return true;
      }
      if (command === '/retry') {
        reconnectNoticeShown = false;
        await poll();
        connectEventStream();
        return true;
      }
      if (command === '/stop') {
        await stopRun();
        return true;
      }
      return false;
    }
    function isTerminalOnlyCommand(command) {
      const name = String(command || '').trim().split(/\\s+/)[0].toLowerCase();
      return commandSuggestions.some(item => item.kind === 'terminal' && item.value === name);
    }
    function showTerminalOnlyCommand(command) {
      const name = String(command || '').trim().split(/\\s+/)[0] || 'that command';
      localTurns.push({
        id: 'terminal-only-' + Date.now(),
        role: 'system',
        text: name + ' opens local terminal UI and is not runnable from the phone yet.',
      });
      renderTerminal({ ...latestSnapshot, state: latestSnapshot.state || 'idle', messages: localTurns });
    }
    function showLocalNotice(text) {
      localTurns.push({ id: 'notice-' + Date.now(), role: 'system', text });
      renderTerminal({ ...latestSnapshot, state: latestSnapshot.state || 'idle', messages: localTurns });
    }
    async function submitPrompt(value = promptEl.value) {
      const prompt = value.trim();
      if (!prompt) return;
      if (isTerminalOnlyCommand(prompt)) {
        showTerminalOnlyCommand(prompt);
        updateControls();
        renderSuggestions();
        resetMomentaryMods();
        return;
      }
      if (await runLocalSlashCommand(prompt)) {
        promptHistory.push(prompt);
        promptHistory = promptHistory.slice(-50);
        promptHistoryIndex = -1;
        promptEl.value = '';
        resizePrompt();
        updateControls();
        renderSuggestions();
        resetMomentaryMods();
        return;
      }
      if (!canSubmitPrompt()) {
        showLocalNotice(latestSnapshot?.busyOwner === 'terminal'
          ? 'Terminal is working. Phone submit is paused until the local session is idle.'
          : 'A mobile run is already active. Stop it or wait for it to finish.');
        updateControls();
        return;
      }
      promptHistory.push(prompt);
      promptHistory = promptHistory.slice(-50);
      promptHistoryIndex = -1;
      localTurns.push({ id: 'local-' + Date.now(), role: 'user', text: prompt });
      applySnapshot({ ...latestSnapshot, state: 'busy', messages: localTurns });
      await api('/api/message', { method: 'POST', body: JSON.stringify({ prompt }) });
      promptEl.value = '';
      resizePrompt();
      updateControls();
      renderSuggestions();
      resetMomentaryMods();
      await poll();
    }
    async function sendCommand(command) {
      promptEl.value = '';
      await submitPrompt(command);
    }
    async function stopRun() {
      if (!canStopRun()) {
        showLocalNotice(latestSnapshot?.busyOwner === 'terminal'
          ? 'Terminal-owned work can only be stopped from the terminal.'
          : 'No mobile-owned run is active.');
        updateControls();
        return;
      }
      await api('/api/stop', { method: 'POST', body: '{}' });
      resetMomentaryMods();
      await poll();
    }
    function handleVirtualKey(key) {
      if (mods.ctrl && (key === 'c' || key === 'd' || key === 'esc')) return stopRun();
      if (mods.cmd && mods.shift && key === 'slash') {
        setPromptValue('/');
        resetMomentaryMods();
        return;
      }
      if (mods.cmd && key === 'slash') {
        setPromptValue('');
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
      if (document.body.classList.contains('suggesting')) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          selectedSuggestionIndex = (selectedSuggestionIndex + 1) % visibleSuggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          selectedSuggestionIndex = (selectedSuggestionIndex + visibleSuggestions.length - 1) % visibleSuggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          acceptSuggestion();
          return;
        }
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        submitPrompt().catch(handleActionError);
      }
    });
    promptEl.addEventListener('input', resizePrompt);
    promptEl.addEventListener('input', () => updateControls());
    promptEl.addEventListener('input', renderSuggestions);
    promptEl.addEventListener('focus', () => setTypingMode(true));
    promptEl.addEventListener('blur', () => {
      setTimeout(() => setTypingMode(document.activeElement === promptEl), 80);
    });
    window.addEventListener('resize', syncViewportHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewportHeight);
      window.visualViewport.addEventListener('scroll', syncViewportHeight);
    }
    resizePrompt();
    renderSuggestions();
    syncViewportHeight();
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
        snapshot.workspace ? compactWorkspace(snapshot.workspace) : null,
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
    function compactWorkspace(value) {
      const name = basename(value);
      return name ? '~/' + name : '~';
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

  const lines: string[] = []

  const turns = snapshot.messages ?? []
  if (turns.length === 0 && !snapshot.lastResponse) {
    lines.push('› mobile session ready')
    lines.push('  waiting for input')
  } else {
    for (const turn of turns.slice(-12)) {
      const prefix = turn.role === 'user' ? '› ' : turn.role === 'system' ? '! ' : '  '
      const text = turn.text.trim()
      if (!text) continue
      const wrapped = wrapTerminalLine(text)
      lines.push(`${prefix}${wrapped[0]}`)
      for (const line of wrapped.slice(1)) lines.push(`  ${line}`)
      lines.push('')
    }
    if (turns.length === 0 && snapshot.lastResponse) {
      const wrapped = wrapTerminalLine(snapshot.lastResponse.trim())
      lines.push(`  ${wrapped[0]}`)
      for (const line of wrapped.slice(1)) lines.push(`  ${line}`)
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

function compactWorkspace(value: string): string {
  const name = basename(value)
  return name ? `~/${name}` : '~'
}

function wrapTerminalLine(value: string): string[] {
  const limit = 42
  const text = String(value || '')
  const bullet = text.match(/^(\s*[-*]\s+)(.+)$/)
  const prefix = bullet ? bullet[1] : ''
  const continuationPrefix = bullet ? ' '.repeat(prefix.length) : ''
  const words = (bullet ? bullet[2] : text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = prefix
  const availableLimit = Math.max(18, limit - prefix.length)
  for (const word of words) {
    const chunks = splitLongToken(word, availableLimit)
    for (const chunk of chunks) {
      const lineLimit = current.trim().length === 0 ? availableLimit : limit
      if (chunk.length > lineLimit) {
        if (current.trim()) {
          lines.push(current)
          current = continuationPrefix
        }
        lines.push(`${continuationPrefix}${chunk}`)
        continue
      }
      const separator = current.trim().length > 0 && !current.endsWith(' ') ? ' ' : ''
      const next = `${current}${separator}${chunk}`
      if (next.length > lineLimit && current.trim()) {
        lines.push(current)
        current = `${continuationPrefix}${chunk}`
      } else {
        current = next
      }
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

function splitLongToken(token: string, limit: number): string[] {
  const chunks: string[] = []
  let remaining = String(token || '')
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1)
    const cuts = ['/', '-', '_', '.', ':'].map(separator => window.lastIndexOf(separator))
    let cut = Math.max(...cuts)
    if (cut < Math.floor(limit * 0.55)) cut = limit
    else cut += 1
    chunks.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }
  if (remaining) chunks.push(remaining)
  return chunks
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
