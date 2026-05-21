# OpenClaude

OpenClaude is an open-source coding-agent CLI for cloud and local model providers.

Use OpenAI-compatible APIs, Gemini, GitHub Models, Codex OAuth, Codex, Ollama, Atomic Chat, and other supported backends while keeping one terminal-first workflow: prompts, tools, agents, MCP, slash commands, and streaming output.

[Quick Start](#quick-start) | [Setup Guides](#setup-guides) | [Providers](#supported-providers) | [Source Build](#source-build-and-local-development) | [VS Code Extension](#vs-code-extension) | [Community](#community)

## What's New

- First-class xAI support with Grok 4.3, XAI_API_KEY auth, and xAI OAuth browser flow integration
- Local learning with `/learn` — review and apply persistent session learnings to improve future agent accuracy
- Live Telegram bridge with `/telegram` — interact with your OpenClaude session via a secure Telegram bot
- Headless session server with `openclaude server` — run OpenClaude as a daemon
  for remote control, persistence, and early mobile-style REST/SSE clients
- First-class oMLX local model support with saved provider profiles, `OMLX_API_KEY`, `/v1/models` discovery, `dev:omlx`, `profile:doctor`, and `profile:benchmark`
- Optional `omlx-anthropic` fast path for oMLX Anthropic-compatible `/v1/messages` servers, kept separate from the default oMLX preset for safer tool behavior
- Autonomous goal mode with `/goal <objective>` — set a verifiable goal and the agent immediately starts work without a second prompt. It loops autonomously (plan -> act -> review -> continue) across turns until complete. Includes token budget tracking, elapsed-time display, footer status, advisory plans, checkpoints, and auto-completion signals
- Telegram bridge for live session control, including `/telegram setup`, `/btw`, `/pause`, `/resume`, and model switching from your phone
- Local learning with `/learn` and `/learn run` for reusable memory and portable skills
- One CLI across cloud APIs, local models, provider profiles, and agent routing
- Bundled VS Code extension for launch integration and theme support

Fork map: [`docs/fork-map.md`](docs/fork-map.md)

## Current Fork Additions

- `/goal <objective>` now starts the continuation turn automatically. Use `/goal plan` only when you explicitly want plan mode, `/goal act` to force another autonomous step, and `/goal checkpoint` / `/goal restore` around risky edits.
- oMLX model discovery reads the local oMLX settings/API key, ignores stale non-oMLX cache entries, and refreshes `/model` from the live local server. Selecting an oMLX model applies the provider route for the current process, and `/model` can auto-unload the previous local model after switching.
- `/status` includes local runtime health for offline work: OpenClaude process memory, auto-unload state, oMLX endpoint/auth state, memory limits, cache settings, cache disk usage, cache directory, and cached-token totals from oMLX stats.
- `/model` marks likely multimodal entries as `Vision`, and image paste warns when a local text-only model is selected.
- `/learn` stores durable reusable lessons and `/learn run` applies pending learning work.
- Telegram session control keeps runtime pause/resume/model state in sync, reconnects after transient polling/focus interruptions, and keeps phone commands matched to the active CLI session.
- `/benchmark` is split into a command module with local model benchmark helpers and tests.
- `/tui fullscreen` enables flicker-free alternate-screen rendering with a persistent OpenClaude header, fixed prompt placement, virtualized scrollback, and honest env/tmux override reporting.
- Goal/status footers now keep live elapsed time, token usage, and `CTX` context percentage visible in CLI, `/tui default`, and `/tui fullscreen`. Local providers without usage metadata fall back to streamed-token estimates, and unknown context windows show `CTX ?`.
- `/logo` now picks the startup/header mascot, including Shiba, gorilla, shark, and the rest of the pixel mascot set.
- Agent View adds `openclaude agents`, `openclaude --bg`, `attach`, `logs`, `stop`, `respawn`, and `rm` for managing detached background sessions from one terminal, with git worktree isolation when available. In fullscreen mode it now opens as a clean full-screen dashboard instead of leaking the current chat transcript behind it. Attached threads support interactive `/model` and `/provider` pickers for switching that thread without leaving the session, and dashboard rows keep their own model/provider context for `CTX` reporting. See [`docs/agent-view.md`](docs/agent-view.md).
- Practical feature backlog and comparison notes live in [`docs/planning/implementation-list.md`](docs/planning/implementation-list.md).

## Why OpenClaude

- Use one CLI across cloud APIs and local model backends
- Save provider profiles inside the app with `/provider`
- Run with OpenAI-compatible services, xAI, Gemini, GitHub Models, Codex OAuth, Codex, Ollama, Atomic Chat, and other supported providers
- Keep coding-agent workflows in one place: bash, file tools, grep, glob, agents, tasks, MCP, and web tools
- Use the bundled VS Code extension for launch integration and theme support

## Quick Start

### Install From This Fork

```bash
git clone https://github.com/stamsam/openclaude-private.git
cd openclaude-private
bun install
bun run build
bun run dev
```

If `ripgrep` is missing, install it system-wide and confirm `rg --version` works in the same terminal before starting OpenClaude.

### Start

```bash
openclaude
```

Inside OpenClaude:

- run `/provider` for guided provider setup and saved profiles
- run `/onboard-github` for GitHub Models onboarding
- run `/goal <objective>` to set a long-running verifiable objective
- run `/telegram setup` and `/telegram` if you want live phone access to the current session

### Fastest local oMLX setup

If your oMLX server is running on `127.0.0.1:8000`:

```bash
bun run profile:init -- --provider omlx --api-key 1234 --model "Gemma 4 Gem E4b 8bit"
openclaude
```

Useful local checks:

```bash
bun run profile:doctor -- --provider omlx --api-key 1234
bun run profile:benchmark -- --provider omlx --api-key 1234 --model "Gemma 4 Gem E4b 8bit"
```

### Fastest OpenAI setup

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o

openclaude
```

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_API_KEY="sk-your-key-here"
$env:OPENAI_MODEL="gpt-4o"

openclaude
```

### Private Fork Features

- **/learn**: Review and apply local learnings. OpenClaude tracks patterns and feedback to improve its coding quality in your specific workspace.
- **/server [local|status|stop|tailscale|pair|reset-token]**: Start or manage the in-session phone companion UI for the live terminal session.
- **/exit** and **/quit**: Exit the interactive REPL through the normal shutdown flow.
- **/telegram [on|off|status|setup]**: Bridge your live terminal session to a Telegram bot for remote coding from your phone.
- **openclaude server**: Start a headless HTTP server for long-lived sessions,
  remote control connections, and early mobile-style REST/SSE clients. See
  [`docs/mobile-server-architecture.md`](docs/mobile-server-architecture.md).

### Mobile `/server` Companion

`/server` starts a phone-friendly mini terminal for the OpenClaude session
already running on your Mac. It is intended as a private companion surface for
checking status, sending short prompts, stopping mobile-owned runs, and using
phone-safe controls from iPhone Safari.

Start it from inside OpenClaude:

```text
/server
```

By default it binds local-only on `127.0.0.1`, so the printed URL works only on
the Mac. For phone access over your private network, run:

```text
/server tailscale
```

Pair another device with `/server pair`; revoke all existing phone tokens and
return to local-only mode with `/server reset-token`. Treat every printed phone
URL and token as private. Do not expose the mobile server publicly.

The phone UI is optimized for iPhone Safari with the keyboard open: compact
terminal layout, 16px prompt text to avoid iOS zoom, visible-viewport resizing,
slash suggestions, phone-safe versus terminal-only command labels, and extra
bottom padding so final summaries remain readable above the mobile composer.

### Fastest xAI setup

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export XAI_API_KEY=your-key-here
export OPENAI_MODEL=grok-4.3

openclaude
```

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:XAI_API_KEY="your-key-here"
$env:OPENAI_MODEL="grok-4.3"

openclaude
```

### Fastest local Ollama setup

macOS / Linux:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=qwen2.5-coder:7b

openclaude
```

Windows PowerShell:

```powershell
$env:CLAUDE_CODE_USE_OPENAI="1"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_MODEL="qwen2.5-coder:7b"

openclaude
```

### Using Ollama's launch command

If you have [Ollama](https://ollama.com) installed, you can skip the env var setup entirely:

```bash
ollama launch openclaude --model qwen2.5-coder:7b
```

This automatically sets `ANTHROPIC_BASE_URL`, model routing, and auth so all API traffic goes through your local Ollama instance. Works with any model you have pulled — local or cloud.

## Setup Guides

Beginner-friendly guides:

- [Non-Technical Setup](docs/non-technical-setup.md)
- [Windows Quick Start](docs/quick-start-windows.md)
- [macOS / Linux Quick Start](docs/quick-start-mac-linux.md)

Advanced and source-build guides:

- [Advanced Setup](docs/advanced-setup.md)
- [Android Install](ANDROID_INSTALL.md)

## Supported Providers

| Provider | Setup Path | Notes |
| --- | --- | --- |
| OpenAI-compatible | `/provider` or env vars | Works with OpenAI, OpenRouter, DeepSeek, Groq, Mistral, LM Studio, and other compatible `/v1` servers |
| Hicap | `/provider` or OpenAI-compatible env vars | Uses `api-key` auth, discovers models from unauthenticated `/models`, and supports Responses mode for `gpt-` models |
| Gemini | `/provider` or env vars | Supports API key only |
| GitHub Models | `/onboard-github` | Interactive onboarding with saved credentials |
| Codex OAuth | `/provider` | Opens ChatGPT sign-in in your browser and stores Codex credentials securely |
| xAI | `/provider` or env vars | Supports XAI_API_KEY and xAI OAuth browser flow |
| Codex | `/provider` | Uses existing Codex CLI auth, OpenClaude secure storage, or env credentials |
| Ollama | `/provider`, env vars, or `ollama launch` | Local inference with no API key |
| Atomic Chat | `/provider`, env vars, or `bun run dev:atomic-chat` | Local Model Provider; auto-detects loaded models |
| Bedrock / Vertex / Foundry | env vars | Additional provider integrations for supported environments |

## What Works

- **Tool-driven coding workflows**: Bash, file read/write/edit, grep, glob, agents, tasks, MCP, and slash commands
- **Streaming responses**: Real-time token output and tool progress
- **Tool calling**: Multi-step tool loops with model calls, tool execution, and follow-up responses
- **Images**: URL and base64 image inputs for providers that support vision
- **Provider profiles**: Guided setup plus saved user-level provider profile support
- **Local and remote model backends**: Cloud APIs, local servers, and Apple Silicon local inference

## Provider Notes

OpenClaude supports multiple providers, but behavior is not identical across all of them.

- Anthropic-specific features may not exist on other providers
- Tool quality depends heavily on the selected model
- Smaller local models can struggle with long multi-step tool flows
- Some providers impose lower output caps than the CLI defaults, and OpenClaude adapts where possible

For best results, use models with strong tool/function calling support.

## Agent Routing

OpenClaude can route different agents to different models through settings-based routing. This is useful for cost optimization or splitting work by model strength.

Add to `~/.openclaude.json`:

```json
{
  "agentModels": {
    "deepseek-v4-flash": {
      "base_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-key"
    },
    "gpt-4o": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key"
    }
  },
  "agentRouting": {
    "Explore": "deepseek-v4-flash",
    "Plan": "gpt-4o",
    "general-purpose": "gpt-4o",
    "frontend-dev": "deepseek-v4-flash",
    "default": "gpt-4o"
  }
}
```

When no routing match is found, the global provider remains the fallback.

> **Note:** `api_key` values in `settings.json` are stored in plaintext. Keep this file private and do not commit it to version control.

## Web Search and Fetch

By default, `WebSearch` works on non-Anthropic models using DuckDuckGo. This gives GPT-4o, DeepSeek, Gemini, Ollama, and other OpenAI-compatible providers a free web search path out of the box.

> **Note:** DuckDuckGo fallback works by scraping search results and may be rate-limited, blocked, or subject to DuckDuckGo's Terms of Service. If you want a more reliable supported option, configure Firecrawl.

For Anthropic-native backends and Codex responses, OpenClaude keeps the native provider web search behavior.

`WebFetch` works, but its basic HTTP plus HTML-to-markdown path can still fail on JavaScript-rendered sites or sites that block plain HTTP requests.

Set a [Firecrawl](https://firecrawl.dev) API key if you want Firecrawl-powered search/fetch behavior:

```bash
export FIRECRAWL_API_KEY=your-key-here
```

If you prefer Tavily for web search fallback, set:

```bash
export TAVILY_API_KEY=your-key-here
```

With Firecrawl enabled:

- `WebSearch` can use Firecrawl's search API while DuckDuckGo remains the default free path for non-Claude models
- `WebFetch` uses Firecrawl's scrape endpoint instead of raw HTTP, handling JS-rendered pages correctly

With Tavily enabled:

- `WebSearch` can fall back to Tavily when native provider search is unavailable
- this is especially useful on OpenAI-compatible local/provider setups where DuckDuckGo scraping gets rate-limited

Free tier at [firecrawl.dev](https://firecrawl.dev) includes 500 credits. The key is optional.

## Goal Mode

OpenClaude includes a local autonomous goal layer:

```text
/goal Ship the Telegram bridge without breaking the local REPL flow.
/goal
/goal pause
/goal resume
/goal clear
```

What it does:

- stores the active goal locally
- injects a continuation prompt while the goal is active
- tracks elapsed time and token usage
- keeps the footer live when switching permission modes or opening Agent View
- supports pause, resume, and clear flows from the CLI

The goal command is local-first and works without any external service.

---

## Headless HTTP / Mobile Server

OpenClaude now has two server surfaces:

- `/server` runs a session-scoped phone companion UI for the OpenClaude process
  already open in your terminal. Use `/server` for quick local access, `/server
  tailscale` for phone access over Tailscale, `/server pair` for another device,
  and `/server stop` to shut it down. Tailscale pairing prints a terminal QR
  code. It supports token, cookie, and Basic auth, plus an OpenCode-style
  `/global/event` SSE stream, `/doc`, and `/openapi.json`. See
  [`docs/mobile-server.md`](docs/mobile-server.md).
- `openclaude server` runs a separate headless daemon for long-lived sessions,
  local dashboards, and future OpenCode-style mobile clients.

OpenClaude can run as a headless HTTP server for local dashboards, phone
clients, and future OpenCode-style mobile workflows. The current server exposes
health, Server-Sent Events, project, session, prompt, message, and abort routes.
It keeps the older WebSocket session bridge for compatibility while the richer
domain API is filled in.

### Start the server

Start the server on a random local port:

```bash
node dist/cli.mjs server --host 127.0.0.1 --port 0
```

For LAN/mobile testing, bind to all interfaces and use the printed endpoint or
the machine's LAN IP:

```bash
node dist/cli.mjs server --host 0.0.0.0 --port 0
```

Important routes:

| Route | Purpose |
|-------|---------|
| `GET /global/health` | server reachability check |
| `GET /global/event` | SSE stream with `server.connected`, heartbeat, session, status, and message events |
| `GET /project` | current project/directory metadata |
| `GET /session` / `POST /session` | list or create sessions |
| `GET /session/:id/message` | message records with `info` and `parts` |
| `POST /session/:id/message` | send a text prompt |
| `POST /session/:id/abort` | stop a running session |

Auth accepts the generated Bearer token and OpenCode-style Basic auth. The Basic
username defaults to `openclaude`; override it with `--auth-username`.

```bash
curl -H "Authorization: Basic $(printf 'openclaude:<token>' | base64)" \
  http://127.0.0.1:<port>/global/health
```

See [`docs/mobile-server-architecture.md`](docs/mobile-server-architecture.md)
for the OpenCode comparison and remaining mobile API work.

### Telegram bridge

OpenClaude supports two Telegram paths:

- in-session Telegram access with `/telegram` and `/telegram setup`
- a legacy standalone local bridge command that talks to the older headless
  gRPC server

For the live REPL path, launch OpenClaude normally and then use:

```text
/telegram setup
/telegram
```

`/telegram setup` now walks through the bot token and allowed Telegram user ID step by step inside OpenClaude, saves those credentials globally, and uses the current session directory as the default workspace.

The in-session bridge is intended for controlling a live local OpenClaude session from your phone:

- plain Telegram messages default to `/ask <prompt>` and submit work into the live session
- `/btw <prompt>` is Telegram-native: it answers in Telegram, does not open the local `/btw` modal, and does not interrupt the main conversation
- `/status` reports bridge state, pause state, active run, model, provider, workspace, and any local overlay
- `/pause` and `/resume` control whether new Telegram prompts are accepted
- `/stop` cancels the active Telegram-run prompt
- `/dismiss` closes the active local OpenClaude overlay only
- `/model` or `/models` shows the active model
- `/model <name>` or `/models <name>` switches the live session model after validation
- Telegram polling skips startup backlog so old messages are not replayed after restart
- polling state is stabilized so normal React re-renders do not repeatedly restart the bridge

The bridge is local-first: it uses Telegram long polling, accepts messages only from the configured numeric Telegram user ID, does not store secrets in repo files, and keeps tool approvals local for now.

For the legacy standalone bridge, start the gRPC server:

```bash
npm run dev:grpc
```

Then in another terminal:

```bash
node dist/cli.mjs telegram
```

Required environment:

```bash
export TELEGRAM_BOT_TOKEN="123456789:abcdef..."
export TELEGRAM_ALLOWED_USER_ID="123456789"
export OPENCLAUDE_WORKSPACE_DIR="/absolute/path/to/project"
export OPENCLAUDE_GRPC_HOST="127.0.0.1"
export OPENCLAUDE_GRPC_PORT="50051"
```

See [`docs/telegram.md`](docs/telegram.md) for setup, commands, safety notes, and troubleshooting.

### Local learning

OpenClaude includes an experimental local learning loop controlled by `/learn`:

- `/learn` previews pending local memory and skill candidates without mutating files
- `/learn run` applies safe candidates, writes a report, and archives processed queue items
- learned project facts are stored under `~/.openclaude/memory/MEMORY.md`
- optional user facts are gated and do not auto-save sensitive data by default
- learned skills are stored as portable drafts under `~/.openclaude/skills/`
- learning session evidence is stored under `~/.openclaude/learn-sessions/`
- local learning evidence, queues, reports, memory, and skills are ignored by default through `~/.openclaude/.gitignore`
- active OpenClaude provider/model settings are reused; no separate learning API key is required
- `/learn` is intentionally conservative: one-off observations stay queued until they repeat enough to be worth promoting

Useful paths and overrides:

```bash
OPENCLAUDE_HOME=~/.openclaude
OPENCLAUDE_MEMORY_DIR=~/.openclaude/memory
OPENCLAUDE_SKILLS_DIR=~/.openclaude/skills
OPENCLAUDE_LEARN_NUDGE_EVERY=10
```

Current promotion thresholds:

- memory facts require 2 observations before `/learn` surfaces them as promotable
- workflow skills require 3 observations before `/learn run` will draft or update them

See [`docs/learning.md`](docs/learning.md) for behavior, limits, and safety rules.

---

## Source Build And Local Development

```bash
bun install
bun run build
node dist/cli.mjs
```

Helpful commands:

- `bun run dev`
- `bun run typecheck` for the maintained TypeScript gate covering recently hardened local-runtime, oMLX, mascot, and Telegram state surfaces
- `bun run typecheck:all` for the full historical repo scan; this intentionally remains a debt tracker until the broader app graph is cleaned up
- `bun run typecheck:tests` for the separate test TypeScript debt scan
- `bun test`
- `bun run test:coverage`
- `bun run security:pr-scan -- --base origin/main`
- `bun run smoke`
- `bun run doctor:runtime`
- `bun run verify:privacy`
- focused `bun test ...` runs for the areas you touch

## Testing And Coverage

OpenClaude uses Bun's built-in test runner for unit tests.

Run the full unit suite:

```bash
bun test
```

Generate unit test coverage:

```bash
bun run test:coverage
```

Open the visual coverage report:

```bash
open coverage/index.html
```

If you already have `coverage/lcov.info` and only want to rebuild the UI:

```bash
bun run test:coverage:ui
```

Use focused test runs when you only touch one area:

- `bun run test:provider`
- `bun run test:provider-recommendation`
- `bun test path/to/file.test.ts`

Recommended contributor validation before opening a PR:

- `bun run build`
- `bun run smoke`
- `bun run test:coverage` for broader unit coverage when your change affects shared runtime or provider logic
- focused `bun test ...` runs for the files and flows you changed

Coverage output is written to `coverage/lcov.info`, and OpenClaude also generates a git-activity-style heatmap at `coverage/index.html`.
## Repository Structure

- `src/` - core CLI/runtime
- `scripts/` - build, verification, and maintenance scripts
- `docs/` - setup, contributor, and project documentation
- `python/` - standalone Python helpers and their tests
- `vscode-extension/openclaude-vscode/` - VS Code extension
- `.github/` - repo automation, templates, and CI configuration
- `bin/` - CLI launcher entrypoints

## VS Code Extension

The repo includes a VS Code extension in [`vscode-extension/openclaude-vscode`](vscode-extension/openclaude-vscode) for OpenClaude launch integration, provider-aware control-center UI, and theme support.

## Security

If you believe you found a security issue, see [SECURITY.md](SECURITY.md).

## Community

- Use [GitHub Discussions](https://github.com/stamsam/openclaude-private/discussions) for Q&A, ideas, and community conversation
- Use [GitHub Issues](https://github.com/stamsam/openclaude-private/issues) for confirmed bugs and actionable feature work

## Contributing

Contributions are welcome.

For larger changes, open an issue first so the scope is clear before implementation. Helpful validation commands include:

- `bun run build`
- `bun run test:coverage`
- `bun run smoke`
- focused `bun test ...` runs for files and flows you changed


## Disclaimer

OpenClaude is an independent community project and is not affiliated with, endorsed by, or sponsored by Anthropic.

OpenClaude originated from the Claude Code codebase and has since been substantially modified to support multiple providers and open use. "Claude" and "Claude Code" are trademarks of Anthropic PBC. See [LICENSE](LICENSE) for details.

## License

See [LICENSE](LICENSE).
