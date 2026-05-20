# Sam Mobile Server

`/server` starts a phone-friendly companion UI for the live OpenClaude session
that is already open in the terminal.

## Commands

```text
/server
/server local
/server status
/server stop
/server tailscale
/server pair
/server reset-token
```

## Defaults

- `/server` starts local-only on `127.0.0.1`. Phone access is off by default.
- `/server local` forces `127.0.0.1:4097` for Mac-only access.
- Requires a generated bearer token for all API calls. Device tokens are stored
  in the OpenClaude config directory and survive restarts.
- OpenCode-style Basic auth is also accepted for compatible mobile clients; use
  any username and the device token as the password.
- Shows a tokenized URL in the command result. Opening it once on a device sets
  a browser cookie, so future visits can use the plain bookmarked `Phone URL`
  without copying the token again. The web page removes the token from the
  address bar after pairing.
- `/server pair` creates a new device token without revoking existing paired
  devices. If the current server is already bound to Tailscale, pairing keeps
  that phone URL and prints a terminal QR code.
- `/server reset-token` revokes existing mobile device tokens, creates one
  fresh token, and returns the server to local-only mode.
- If the browser shows `Unauthorized`, the token is missing, stale, or copied
  incompletely. Run `/server pair` and open the newly printed full `Phone URL`
  once on that device.
- `/server tailscale` binds to the detected Tailscale IP and shows a phone URL when
  `tailscale ip -4` or `TAILSCALE_IP` is available.
- The server is session-scoped. Closing OpenClaude stops it.

## API Shape

The in-session server keeps the lightweight `/api/*` routes used by the built-in
web page and also exposes OpenCode-style read aliases:

- `GET /global/health`
- `GET /global/event`
- `GET /project`
- `GET /project/current`
- `GET /provider`
- `GET /provider/auth`
- `GET /config`
- `GET /config/providers`
- `GET /command`
- `GET /session`
- `GET /session/status`
- `GET /session/live`
- `GET /session/live/message`
- `POST /session/live/message`
- `POST /session/live/prompt_async`
- `POST /session/live/command`
- `POST /session/live/abort`
- `GET /doc`
- `GET /openapi.json`

`/global/event` is an SSE stream. The mobile web UI listens to it for live
snapshot updates and falls back to slower polling when EventSource is
unavailable or interrupted. The stream and fallback polling pause while the page
is backgrounded and reconnect when it becomes visible again.

OpenCode-style mutation aliases accept text parts on
`POST /session/live/message`, accept simple `{ "prompt": "..." }` bodies on
`POST /session/live/prompt_async`, and map `POST /session/live/abort` to the
same mobile-owned stop behavior as the built-in web UI.

The provider/config/command endpoints are intentionally read-only and reflect
the active live session. They exist so OpenCode-shaped clients can discover the
current provider, model, and mobile-safe slash commands without requiring the
full headless daemon. `GET /provider/auth` currently returns no auth methods
because the phone companion does not manage provider credentials.

`POST /session/live/command` only accepts the mobile-safe `dismiss` command.
Unknown commands are rejected instead of being forwarded into the local
terminal session.

The page also publishes `manifest.webmanifest` and iOS standalone metadata so it
can be saved to the phone home screen as a compact companion app.

## Security Notes

- Tokenized URLs are only for first pairing. After load, browser requests use
  Authorization headers or the paired-device cookie, and mutation routes do not
  accept query-token auth.
- Cookie-authenticated mutation routes require the mobile AJAX header
  `X-OpenClaude-Mobile: 1`, in addition to same-origin request checks.
- Unpaired or invalid root page loads do not render workspace, model, or
  transcript state.
- Active SSE clients are closed when the server stops or restarts.
- The root mobile page uses a per-response CSP nonce for its inline style and
  script blocks; `unsafe-inline` is not enabled.

## Mobile Controls

The web UI is a compact Sam app surface with a session timeline, docked
composer, status rail, and virtual keys for phone use:

- modifiers: Shift, Cmd, Alt, Ctrl
- controls: Esc, Tab, arrows, slash, Enter
- common actions: Send, Retry, Stop, Clear

Modifier buttons are latching controls. Shift+Enter and Alt+Enter insert a
newline. Ctrl+C/Ctrl+D stop mobile-owned runs. Esc dismisses local overlays.
Other slash commands are blocked from mobile until they have native server
endpoints, so the phone UI cannot accidentally open local TUI overlays.

The terminal surface uses compact `~/project` workspace labels and wraps
transcript lines for narrow phone widths so long agent output does not require
sideways scrolling.

## Safety

Do not expose the server publicly. Use the printed `Phone URL` for phone access
over Tailscale, and treat the URL as a secret because it contains the session
token. Use `/server reset-token` if a device token is exposed and you want to
revoke all paired devices. A `127.0.0.1` URL only works on the Mac running
OpenClaude, not on an iPhone.
