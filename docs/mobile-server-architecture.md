# Mobile Server Architecture

## OpenCode Pattern

OpenCode's mobile app is a client for a headless server, not a remote terminal.
The server exposes:

- `GET /global/health` for reachability checks.
- `GET /global/event` as a Server-Sent Events stream. It immediately emits
  `server.connected`, then periodic `server.heartbeat` events, then session,
  message, permission, diff, and question events.
- Basic auth using a username/password pair.
- REST resources for projects, providers, sessions, messages, prompts, diffs,
  abort, revert, summarize, and permissions.

The important design choice is that the mobile UI renders structured domain
state. It does not parse terminal output or proxy stdin/stdout as the primary
interface.

## OpenClaude Target

OpenClaude should keep the current process manager only as the execution layer.
The public mobile API should be:

- Health and global SSE endpoints compatible with OpenCode-style clients.
- Basic auth for mobile setup, while retaining bearer auth for existing
  internal links.
- Session REST aliases that use `directory` instead of forcing a live terminal
  attachment.
- A durable event bus that emits typed session, message, tool, permission, diff,
  and status payloads.
- Transcript-backed `GET /session/:id/message` responses, rather than an
  in-memory or stdout-only view.

## Current Slice

There are currently two mobile/server surfaces:

- `/server` is the in-session phone companion. It starts a small HTTP UI from
  the live REPL process and mirrors the current transcript, status, model, and
  prompt submission path. It now uses an OpenCode-style `/global/event` SSE
  stream for live snapshot updates, with polling only as a fallback. It also
  exposes `/doc` and `/openapi.json` for client discovery, server-renders the
  first authorized snapshot, removes tokenized pairing URLs from browser
  history, pauses mobile streams while backgrounded, closes SSE clients on
  shutdown, blocks cookie-only mutations without a mobile AJAX header, and does
  not render private state to unpaired root page loads. Its compatibility layer
  includes read-only provider/config/command discovery plus `GET /session/live`,
  `POST /session/live/message`, `POST /session/live/prompt_async`, and
  `POST /session/live/abort` so OpenCode-shaped mobile clients can use session
  routes instead of the internal `/api/*` routes. It intentionally does not
  expose provider credential mutation; `GET /provider/auth` returns no auth
  methods. Its built-in page now separates phone-safe and phone-local slash
  affordances from terminal-only commands, keeps terminal-only commands out of
  the default bare-slash menu, and blocks terminal-only slash commands in the
  browser before they reach the live REPL. Disabled submit/stop states are also
  short-circuited in the browser where possible to avoid avoidable mutation
  requests.
- `openclaude server` is the separate headless daemon. It exposes the first
  OpenCode-style compatibility layer:

- `GET /global/health`
- `GET /global/event`
- `GET /project`
- `GET /session`
- `POST /session`
- `GET /session/status`
- `GET /session/:id/message`
- `POST /session/:id/message`
- `POST /session/:id/abort`

Events are emitted in the OpenCode-style envelope:

```json
{
  "directory": "/path/to/project",
  "payload": {
    "id": "...",
    "type": "message.updated",
    "properties": {
      "info": {
        "id": "...",
        "sessionID": "...",
        "role": "assistant",
        "time": { "created": 1760000000000 }
      }
    }
  }
}
```

`GET /session/:id/message` now returns message records shaped as
`{ info, parts }`, and the server captures user prompts plus stdout-backed
assistant messages for the live process.

It still keeps the older `/sessions` and `/sessions/:id/ws` bridge so current
direct-connect behavior is not broken while the mobile API is filled in.

## Remaining Work

The next server pass should replace stdout-derived behavior with a real domain
event layer:

- Stream true assistant deltas as `message.part.delta` instead of coarse stdout
  line messages.
- Persist and return transcript-backed messages across server restarts.
- Surface permission requests as `permission.asked` and replies as
  `permission.replied`.
- Expose provider/model inventory through `/provider`.
- Expose diffs through `/session/:id/diff`.
- Add mobile discovery polish such as QR setup and optional mDNS.
