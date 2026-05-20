# OpenClaude Private Agent Handoff

## Workspace

- Repo: `/Users/samstamatiou/Desktop/AI Workspace/Codex Projects/active/openclaude-private`
- Current branch: `main`
- Status last checked: 2026-05-20
- Current local head before this final QA pass: `fb827a3d Tighten mobile server phone controls`
- Private remote head: check with `git status --short --branch` after push; this repo may also contain unrelated local exit-summary edits
- Stock comparison ref: `gitlawb/main` refreshed from `https://github.com/Gitlawb/openclaude.git` at `03f87915 fix(xml): guard escapeXml/escapeXmlAttr against null and undefined (#1250)`
- Important caveat: refreshed stock `main` currently has no merge base with this private fork, so compare by snapshot diff (`git diff gitlawb/main HEAD`) rather than ancestry diff (`...`).

## Start Here

- Read `README.md` for install, quick start, and current fork features.
- Read `docs/fork-map.md` before applying upstream patches.
- Read `docs/agent-view.md` for the background session dashboard.
- Read `docs/mobile-server.md` and `docs/mobile-server-architecture.md` before doing more phone/mobile work.
- Read `docs/learning.md` for `/learn` behavior and safety boundaries.
- Read `docs/telegram.md` for phone/Telegram control.
- Read `docs/fullscreen-rendering.md` for `/tui fullscreen`.

## What This Fork Adds Versus Stock

- OpenClaude private branding and local-source install flow.
- Version 12.0.0 with display version 12.0.
- First-class xAI support with Grok 4.3, XAI_API_KEY auth, and xAI OAuth browser flow integration.
- Local learning engine (`src/learning`) with `/learn` command.
- Telegram bridge (`src/telegram`) with `/telegram` and CLI `telegram` command.
- In-session phone companion (`/server`) plus headless session server
  (`openclaude server`) with an early OpenCode-style mobile API layer.
- First-class oMLX local model support, including saved provider profiles, live `/v1/models` discovery, `profile:doctor`, `profile:benchmark`, local runtime status, and auto-unload behavior.
- Optional `omlx-anthropic` route for Anthropic-compatible oMLX `/v1/messages` servers.
- Cerebras provider support and credential routing hardening.
- xAI/Grok OAuth support, including browser auth flow, credential storage helpers, provider menu integration, and OpenAI-compatible shim support.
- Autonomous `/goal` mode with local goal state, continuation prompting, elapsed-time display, token/context footer state, checkpoints, and completion detection.
- Local `/learn` preview/run flow for reusable memory and portable skill candidates.
- Telegram bridge and in-session `/telegram` setup/control, including `/btw`, `/pause`, `/resume`, `/status`, `/stop`, and model/session visibility.
- Agent View: `openclaude agents`, `openclaude --bg`, `attach`, `logs`, `stop`, `respawn`, `rm`, dashboard rows, background session metadata, attach view, and git worktree isolation.
- Fullscreen TUI mode with alternate-screen rendering, fixed header/prompt, less flicker, and dashboard takeover behavior.
- Header/logo/mascot polish, including `/logo`, terminal pixel mascots, and persistent provider/status labeling.
- Context percentage and goal timer UI in CLI, default TUI, fullscreen TUI, and attached/background session views.
- Session-scoped provider/model switching for attached threads and background sessions.
- Local model benchmark helpers and command split for `/benchmark`.
- CI/test hardening for stateful HOME/config-sensitive tests.
- Web search fallback/provider routing hardening and OpenGateway fallback handling.

## Current Slice

This slice polishes the in-session `/server` phone companion UI and keeps it
phone-first: terminal-like layout, iPhone keyboard behavior, slash suggestions,
and client-side guards for commands that still require the local terminal UI.
After committing/pushing this slice, `git status --short --branch` may still
show unrelated exit-summary work that was already dirty before this pass.

Documentation/status edits in this slice:

- `AGENT_HANDOFF.md`
- `docs/mobile-server.md`
- `docs/mobile-server-architecture.md`

In-session `/server` files touched in this slice:

- `src/mobileServer/html.ts`
- `src/mobileServer/html.test.ts`

Unrelated dirty files present before this pass and not part of the mobile
server commit:

- `src/bootstrap/state.ts`
- `src/cost-tracker.ts`
- `src/costHook.ts`
- `src/services/tools/toolExecution.ts`
- `src/setup.ts`
- `src/utils/config.ts`
- `src/utils/gracefulShutdown.ts`
- `src/utils/exitSummary.ts`
- `src/utils/exitSummary.test.ts`

Existing headless server files from `5252fcc3`:

- `src/server/backends/dangerousBackend.ts`
- `src/server/lockfile.ts`
- `src/server/lockfile.test.ts`
- `src/server/server.ts` (Node `http` + `ws`, not `Bun.serve`, with OpenCode-style REST/SSE mobile API primitives)
- `src/server/server.test.ts`
- `src/server/serverBanner.tsx`
- `src/server/serverLog.js`
- `src/server/sessionManager.ts`
- `src/server/sessionManager.test.ts`
- `src/server/types.ts`

Local artifact hygiene:

- `.antigravitycli/9239c90d-b27d-4b12-9e5a-badbbc216c02.json` was an untracked symlink to `~/.gemini/config/projects/...json`; it was removed and `.antigravitycli/` is ignored.

## Useful Commands

```bash
cd "/Users/samstamatiou/Desktop/AI Workspace/Codex Projects/active/openclaude-private"
git status --short --branch
git diff --cached --stat
git diff --stat
git diff --stat gitlawb/main HEAD
bun run typecheck
bun run build
bun run integrations:check
bun test src/commands/server/server.test.ts src/mobileServer/html.test.ts src/mobileServer/server.test.ts src/mobileServer/tokenStore.test.ts src/hooks/useMobileServer.test.ts src/commands.test.ts
bun test src/server/server.test.ts src/server/lockfile.test.ts src/server/sessionManager.test.ts
bun test src/utils/permissions/yoloClassifier.test.ts src/utils/providerProfiles.test.ts
bun test src/utils/providerProfile.test.ts src/utils/providerProfiles.test.ts src/utils/providerValidation.test.ts src/services/api/openaiShim.test.ts src/services/api/openaiErrorClassification.test.ts src/integrations/routeMetadata.test.ts
```

## Recent Local Work

- **Server runtime hardening:** Reworked `src/server/server.ts` to use Node `http` + `ws`, removed per-WebSocket listener leaks, buffered split stdout JSONL lines, forwarded `dangerously_skip_permissions` into the backend CLI, closed SSE clients on shutdown, and fixed dynamic `--port 0` reporting by awaiting the listen event.
- **Mobile server pivot:** OpenCode mobile works through REST resources plus SSE events, not a raw terminal mirror. The current server now exposes `GET /global/health`, `GET /global/event`, `GET /project`, `/session` aliases, Basic auth compatibility, OpenCode-style `{ type, properties }` event payloads, and focused tests in `src/server/server.test.ts`. The WebSocket bridge remains only for backward compatibility while the real domain API is filled in.
- **Message API slice:** `GET /session/:id/message` now returns in-memory `{ info, parts }` message records for live sessions; `POST /session/:id/message` stores user prompts, writes to stdin, emits message/status events, and stdout lines are captured as assistant messages. This is still not durable transcript-backed history.
- **Session lifecycle hardening:** `SessionManager` now prunes stopped sessions before max-session checks, tracks attach/detach counts, supports idle shutdown, and waits for child process exits during `destroyAll()`.
- **Lockfile efficiency:** `src/server/lockfile.ts` now uses async filesystem operations, per-test lock paths, atomic metadata writes, stale metadata cleanup, and held-lock cleanup on metadata write failure.
- **xAI/provider fixes:** xAI-specific base/model env now wins over stale generic OpenAI env, xAI OAuth remains on `responses`, xAI OAuth tokens are discovered in provider presets, and generated integration artifacts were refreshed.
- **Antigravity cleanup:** Removed the local `.antigravitycli` symlink artifact and added `.antigravitycli/` to `.gitignore`.
- **Optional auto-mode prompt import hardening:** `src/utils/permissions/yoloClassifier.ts` no longer crashes test/provider imports when optional classifier prompt text files are absent from this private checkout.
- **Build/typecheck fix:** Kept the app typecheck focused enough to stay fast while still covering the direct server files; the server no longer needs a `bun` external because it no longer imports Bun runtime APIs.
- **In-session `/server` restoration:** Restored the prior phone companion command, mobile HTTP UI, token store, REPL hook, and app-state wiring. `/server` starts local-only by default, `/server tailscale` enables phone access, `/server pair` adds a device token, and `/server stop` disables it for the live session. `/exit` and `/quit` were already registered and now have a focused registry assertion.
- **OpenCode-style mobile refinement:** The in-session mobile server now accepts Basic auth with the device token as password, exposes `/global/health`, `/global/event`, `/project`, `/project/current`, `/session`, `/session/status`, `/session/live/message`, `/doc`, and `/openapi.json`, and the phone page uses EventSource for live snapshot updates with slower polling only as fallback. The UI also has a compact mobile app header for project/model/session state, server-rendered initial snapshots, token URL scrubbing after pairing, standalone web app metadata, larger touch targets, reliable-only default controls, paired-success feedback, and background/foreground stream lifecycle handling.
- **Latest mobile hardening:** Snapshot payloads now expose `canSubmit`, `canStop`, and `busyOwner` so the phone does not show a usable Stop button for terminal-owned work. Cookie-authenticated mutations require `X-OpenClaude-Mobile: 1`, query tokens no longer authorize POSTs, unauthenticated root loads are tested against private state leaks, SSE clients close on server stop, OpenAPI no longer publishes the full workspace path, the root mobile page uses per-response CSP nonces instead of `unsafe-inline`, `/server pair` preserves an existing Tailscale phone bind, and `/server tailscale` prints a terminal QR code.
- **OpenCode-style mutation aliases:** The in-session mobile server now also accepts `GET /session/live`, `POST /session/live/message`, `POST /session/live/prompt_async`, and `POST /session/live/abort`, so external OpenCode-shaped mobile clients can submit text parts or async prompt bodies without using the internal `/api/*` routes.
- **OpenCode-style discovery aliases:** The in-session mobile server also exposes read-only `GET /provider`, `GET /provider/auth`, `GET /config`, `GET /config/providers`, and `GET /command` endpoints backed by the live session snapshot. `/project` now returns the OpenCode-documented array shape, `GET /provider/auth` returns no credential methods, and `POST /session/live/command` only forwards the mobile-safe `dismiss` command.
- **Mobile UI polish:** The phone page now presents a tighter mini-terminal surface with metadata kept in the header/status rail, transcript-first session content, a stronger single-line terminal header, subtle role-based transcript tinting, a dedicated prompt bar, separated action/modifier/key rows, and deterministic transcript wrapping for narrow iPhone-width viewports.
- **iOS keyboard polish:** The prompt uses 16px text to avoid Safari focus zoom, the shell tracks `visualViewport` height changes, typing mode hides the extra key rail, and the prompt row stays inside safe-area margins so it remains docked above the phone keyboard.
- **Mobile slash suggestions:** Typing `/` now opens a compact suggestion strip that distinguishes phone-safe actions (`/dismiss`, `/stop`), phone-local controls (`/clear`, `/retry`), and terminal-only commands (`/model`, `/provider`, `/tui`, `/server`, `/exit`). Terminal-only suggestions are visually disabled and intercepted in the browser before they can be submitted into the live terminal session.
- **Mobile submit efficiency:** The phone page now checks `canSubmit` locally before posting prompts, so Enter on a disabled prompt shows a local notice instead of making an avoidable rejected request.
- **Follow-up slash polish:** The bare `/` menu now stays limited to phone-usable actions, terminal-only suggestions keep a disabled visual treatment even when selected, phone-local suggestions get their own styling, and typed terminal-only commands keep the prompt text in place while showing the local notice.
- **Busy/disabled polish:** Disabled submit/stop paths now short-circuit locally where possible. The prompt placeholder changes to `working` or `terminal busy` when submit is unavailable, and disabled send/stop buttons use quieter styling instead of looking runnable.
- **Final mobile QA pass:** Reviewed the current `/server` UI on a 390px phone viewport against idle, typing, slash-search, terminal-only, and busy states. The current committed UI already keeps terminal-only commands out of the bare slash menu, shows searched terminal-only commands as unavailable, intercepts typed terminal-only commands locally, and short-circuits disabled submit/stop states before avoidable mutation requests.
- **Latest preview screenshots:** Phone-sized Chrome DevTools captures were saved at `/tmp/openclaude-mobile-review-screenshots/final/idle.png`, `/tmp/openclaude-mobile-review-screenshots/final/slash-typing.png`, `/tmp/openclaude-mobile-review-screenshots/final/terminal-only-search.png`, `/tmp/openclaude-mobile-review-screenshots/final/terminal-only-notice.png`, and `/tmp/openclaude-mobile-review-screenshots/final/busy.png`. The typing captures simulate the browser-visible keyboard viewport state; headless Chrome cannot render the real iOS Safari keyboard.
- **Mobile response readability polish:** Long assistant final-response bullets now keep the bullet marker attached to the first wrapped path/command line, wrap long tokens at path-friendly separators, and keep extra transcript bottom padding in typing mode so the final summary lines remain above the mobile composer/accessory area. Before/after captures for the long-final-response fixture are at `/tmp/openclaude-mobile-readability-screenshots/before-long-final-bottom.png` and `/tmp/openclaude-mobile-readability-screenshots/after-long-final-bottom.png`.
- **Verification completed in the latest `/server` pass:** `bun test src/commands/server/server.test.ts src/mobileServer/html.test.ts src/mobileServer/server.test.ts src/mobileServer/tokenStore.test.ts src/hooks/useMobileServer.test.ts src/commands.test.ts`, `bun test src/server/server.test.ts src/server/lockfile.test.ts src/server/sessionManager.test.ts`, `bun run typecheck`, `bun run build`, and `git diff --check` pass.

## Do Not Assume

- Do not treat `gitlawb/main...HEAD` as valid right now; the refreshed stock ref has no merge base with this fork.
- Do not push unless Sam explicitly asks.
- Do not use `git add .`; stage only the intended files.
- Do not revert local dirty files unless Sam explicitly asks.
