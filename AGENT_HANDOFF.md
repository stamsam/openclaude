# OpenClaude Private Agent Handoff

## Workspace

- Repo: `/Users/samstamatiou/Desktop/AI Workspace/Codex Projects/active/openclaude-private`
- Current branch: `main`
- Current local head: `666ae886 Fix xAI OAuth callback handling`
- Private remote head: `origin/main` at `6af01b5f Isolate prompt footer CI test`
- Stock comparison ref: `gitlawb/main` refreshed from `https://github.com/Gitlawb/openclaude.git` at `03f87915 fix(xml): guard escapeXml/escapeXmlAttr against null and undefined (#1250)`
- Important caveat: refreshed stock `main` currently has no merge base with this private fork, so compare by snapshot diff (`git diff gitlawb/main HEAD`) rather than ancestry diff (`...`).

## Start Here

- Read `README.md` for install, quick start, and current fork features.
- Read `docs/fork-map.md` before applying upstream patches.
- Read `docs/agent-view.md` for the background session dashboard.
- Read `docs/learning.md` for `/learn` behavior and safety boundaries.
- Read `docs/telegram.md` for phone/Telegram control.
- Read `docs/fullscreen-rendering.md` for `/tui fullscreen`.

## What This Fork Adds Versus Stock

- OpenClaude private branding and local-source install flow.
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

These files are modified locally and are not committed yet:

- `.release-please-manifest.json`
- `package.json`
- `scripts/build.ts`
- `src/integrations/routeMetadata.test.ts`
- `src/integrations/vendors/xai.ts`
- `src/services/api/openaiShim.test.ts`
- `src/services/api/openaiShim.ts`
- `src/utils/providerProfile.test.ts`
- `src/utils/providerProfile.ts`
- `src/utils/providerValidation.test.ts`

Current pending work appears to be:

- Version/display-version bump to `12.0.0` / `12.0`.
- xAI OAuth treated as a valid xAI credential alongside `XAI_API_KEY`.
- `xai-oauth` provider profile path that maps the OAuth token into OpenAI-compatible request env.
- Tests for xAI OAuth credential selection, provider validation, and route metadata.

## Useful Commands

```bash
cd "/Users/samstamatiou/Desktop/AI Workspace/Codex Projects/active/openclaude-private"
git status --short --branch
git diff --stat gitlawb/main HEAD
git diff --stat
bun run typecheck
bun test src/services/api/openaiShim.test.ts src/utils/providerProfile.test.ts src/utils/providerValidation.test.ts src/integrations/routeMetadata.test.ts
```

## Do Not Assume

- Do not treat `gitlawb/main...HEAD` as valid right now; the refreshed stock ref has no merge base with this fork.
- Do not push unless Sam explicitly asks.
- Do not use `git add .`; stage only the intended files.
- Do not revert local dirty files unless Sam explicitly asks.
