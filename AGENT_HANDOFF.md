# OpenClaude Private Agent Handoff

## Workspace

- Repo: `/Users/samstamatiou/Desktop/AI Workspace/Codex Projects/active/openclaude-private`
- Current branch: `main`
- Status last checked: 2026-05-20
- Current local head: `f7a04fd4 Add xAI OAuth profile support`
- Private remote head: `origin/main` at `f7a04fd4 Add xAI OAuth profile support`
- Stock comparison ref: `gitlawb/main` refreshed from `https://github.com/Gitlawb/openclaude.git` at `03f87915 fix(xml): guard escapeXml/escapeXmlAttr against null and undefined (#1250)`
- Important caveat: refreshed stock `main` currently has no merge base with this private fork, so compare by snapshot diff (`git diff gitlawb/main HEAD`) rather than ancestry diff (`...`).

## Start Here

- Read `README.md` for install, quick start, and current fork features.
- Read `docs/fork-map.md` before applying upstream patches.
- Read `docs/agent-view.md` for the background session dashboard.
- Read `docs/mobile-server-architecture.md` before doing more phone/mobile work.
- Read `docs/learning.md` for `/learn` behavior and safety boundaries.
- Read `docs/telegram.md` for phone/Telegram control.
- Read `docs/fullscreen-rendering.md` for `/tui fullscreen`.

## What This Fork Adds Versus Stock

- OpenClaude private branding and local-source install flow.
- Version 12.0.0 with display version 12.0.
- First-class xAI support with Grok 4.3, XAI_API_KEY auth, and xAI OAuth browser flow integration.
- Local learning engine (`src/learning`) with `/learn` command.
- Telegram bridge (`src/telegram`) with `/telegram` and CLI `telegram` command.
- Headless session server (`src/server`) with `openclaude server` CLI command
  and an early OpenCode-style mobile API layer.
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

## Current Dirty Tree

This checkout is not clean. `HEAD` and `origin/main` match. The intended feature slice spans docs, xAI/provider routing, generated integration metadata, build/typecheck config, Antigravity ignore hygiene, optional auto-mode prompt import hardening, and the headless mobile server.

Documentation/status edits:

- `AGENT_HANDOFF.md`
- `README.md`
- `CHANGELOG.md`
- `docs/mobile-server-architecture.md`

Code/config edits:

- `.gitignore` (ignores `.antigravitycli/`)
- `scripts/build.ts`
- `src/integrations/generated/integrationArtifacts.generated.ts` (regenerated after xAI descriptor changes)
- `src/integrations/vendors/xai.ts`
- `src/main.tsx` (awaits server listen before printing dynamic port and writes a normalized `127.0.0.1` URL when bound to `0.0.0.0`)
- `src/services/api/openaiErrorClassification.ts`
- `src/services/api/openaiShim.ts`
- `src/utils/providerProfile.ts`
- `src/utils/providerSecrets.ts`
- `src/utils/providerValidation.ts`
- `src/utils/permissions/yoloClassifier.ts` (optional prompt asset imports no longer crash tests when prompt files are absent)
- `tsconfig.app.json` (keeps the app typecheck narrow while covering the direct server support files)

Headless server files:

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
- **Verification completed in this pass:** `bun run typecheck`, `bun run build`, `bun run integrations:check`, `bun test src/server/server.test.ts src/server/lockfile.test.ts src/server/sessionManager.test.ts`, `bun test src/utils/permissions/yoloClassifier.test.ts src/utils/providerProfiles.test.ts`, the focused 289-test provider/API route suite, and a `node dist/cli.mjs server --port 0 --host 127.0.0.1` smoke covering auth rejection, Basic auth health, Bearer `/project`, SSE `server.connected`, `/session` create, `/session/status`, and abort all pass. `git diff --check` and `git diff --cached --check` pass.

## Do Not Assume

- Do not treat `gitlawb/main...HEAD` as valid right now; the refreshed stock ref has no merge base with this fork.
- Do not push unless Sam explicitly asks.
- Do not use `git add .`; stage only the intended files.
- Do not revert local dirty files unless Sam explicitly asks.
