# Sams Auto Router 4B-35B

`Sams auto router 4B-35B` is a local OpenAI-compatible proxy for oMLX. It keeps the fast 4B model warm for normal work and lazy-loads the 35B model only when the prompt looks important, hard, long, or review-heavy.

```text
OpenClaude / IDE / CLI
  -> Provider: Sam's Auto Router
  -> http://127.0.0.1:8001/v1
  -> Sams auto router 4B-35B
  -> oMLX on http://127.0.0.1:8000
  -> 4B or 35B
```

## Start

Start oMLX first. Then run:

```bash
bun run router:sam
```

For no terminal window, install the background LaunchAgent once:

```bash
bun run router:sam:install
```

That starts the router now and again at login. It does not change OpenClaude's default provider.

Check it:

```bash
bun run router:sam:status
```

Remove it:

```bash
bun run router:sam:uninstall
```

Defaults:

```text
Router URL: http://127.0.0.1:8001/v1
Router model: Sams auto router 4B-35B
Small model: Qwen3.5-4B-MLX-4bit-MTP
Big model: Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-MLX-4bit-MTP
```

The router reads `~/.omlx/settings.json` for the oMLX host, port, and API key when env vars are not set. oMLX remains the source of truth for model paths, context windows, engine type, load state, and per-model runtime settings.

The router is not a native oMLX weight folder. OpenClaude exposes it as its own provider preset, `Sam's Auto Router`, with a static model named `Sams auto router 4B-35B`. oMLX remains the backend that actually loads and unloads the model weights.

## Configure OpenClaude

Use the built-in provider preset from OpenClaude:

```text
/provider
Sam's Auto Router
```

Then choose the static router model:

```text
/model
Sams auto router 4B-35B
```

You can also use the normal OpenAI-compatible route in other tools:

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://127.0.0.1:8001/v1
export OPENAI_API_KEY=local
export OPENAI_MODEL="Sams auto router 4B-35B"
openclaude
```

Or save it as an OpenClaude startup profile only if you want the router to be the default:

```bash
bun run profile:init -- --provider sams-auto-router --api-key local --base-url http://127.0.0.1:8001/v1 --model "Sams auto router 4B-35B"
```

## Configure IDEs And CLIs

Use either the `Sam's Auto Router` preset, if the tool has this OpenClaude checkout, or a generic OpenAI-compatible provider:

```text
Base URL: http://127.0.0.1:8001/v1
API key: local
Model: Sams auto router 4B-35B
```

The router also exposes `POST /v1/messages` for Anthropic-compatible clients. That endpoint is proxied to oMLX `/v1/messages` after the same routing decision.

## Virtual Models

```text
Sams auto router 4B-35B          Auto route
sams-auto-router-4b-35b          ASCII alias
Sams auto router 4B-35B fast     Always 4B
Sams auto router 4B-35B premium  Always 35B
Sams auto router 4B-35B review   4B draft, then 35B review
```

## Routing Policy

Default: `Qwen3.5-4B-MLX-4bit-MTP`.

Escalate to the 35B model for:

- review, audit, verify, grade, stack-rank, or compare requests
- stack traces, failing tests, exceptions, logs, and root-cause debugging
- architecture, release, production, migration, security, or important decisions
- long pasted context, large diffs, or many tool/schema constraints
- explicit user override like `use big`, `35B`, `think hard`, or `double check`

Borderline precision tasks, such as strict JSON/schema requests, use small-then-verify.

Memory behavior:

- preload and keep 4B warm by default
- do not load 35B at startup
- lazy-load 35B only after routing chooses it
- unload 35B after the response by default
- keep a short in-memory routing stickiness window after hard 35B turns, but still unload 35B between calls

## Useful Options

```bash
bun run router:sam -- --port 8001
bun run router:sam -- --mode efficient
bun run router:sam -- --mode conservative
bun run router:sam -- --no-preload-small
bun run router:sam -- --keep-big-loaded
bun run router:sam -- --no-log
bun run router:sam -- --log-path "$HOME/.omlx/router/sams-auto-router.jsonl"
bun run router:sam -- --small-model "Qwen3.5-4B-MLX-4bit-MTP"
bun run router:sam -- --big-model "Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-MLX-4bit-MTP"
```

Environment variables:

```text
SAMS_ROUTER_PORT
SAMS_ROUTER_HOST
SAMS_ROUTER_OMLX_BASE_URL
SAMS_ROUTER_OMLX_API_KEY
SAMS_ROUTER_SMALL_MODEL
SAMS_ROUTER_BIG_MODEL
SAMS_ROUTER_PRELOAD_SMALL
SAMS_ROUTER_UNLOAD_BIG_AFTER_USE
SAMS_ROUTER_TIMEOUT_MS
SAMS_ROUTER_MODE
SAMS_ROUTER_BIG_THRESHOLD
SAMS_ROUTER_REVIEW_THRESHOLD
SAMS_ROUTER_STICKY_TURNS
SAMS_ROUTER_STICKY_TTL_MS
SAMS_ROUTER_QUALITY_RETRY
SAMS_ROUTER_LOG_ENABLED
SAMS_ROUTER_LOG_PATH
```

## Background Service

`bun run router:sam:install` writes:

```text
~/Library/LaunchAgents/com.sam.sams-auto-router.plist
```

The service runs:

```text
http://127.0.0.1:8001/v1
```

Logs:

```text
~/Library/Logs/SamsAutoRouter/stdout.log
~/Library/Logs/SamsAutoRouter/stderr.log
~/.omlx/router/sams-auto-router.jsonl
```

It is fine if oMLX is not open at login. The router process stays up; requests work once oMLX is running.

The installer does not overwrite `~/.openclaude-profile.json` by default. To intentionally make the router OpenClaude's default startup profile, run:

```bash
bun run router:sam:install -- --openclaude-profile
```

## Route Modes

```text
efficient     Favors 4B; escalates only on stronger signals.
balanced      Default; 4B for normal work, 35B for hard/review/debug tasks.
conservative  Quality-first; escalates or verifies earlier.
```

The virtual model names still override the mode:

```text
Sams auto router 4B-35B fast      Always use 4B.
Sams auto router 4B-35B premium   Always use 35B.
Sams auto router 4B-35B review    4B draft, then 35B review.
```

## Logging And Calibration

The router writes metadata-only JSONL route logs by default:

```text
~/.omlx/router/sams-auto-router.jsonl
```

Each row includes the request id, endpoint, requested router model, selected backend model, route label, score, reason, prompt length, prompt hash, timing, usage, quality-gate flags, and whether the big model was unloaded. It does not write prompt text.

Use the logs to tune thresholds later:

```bash
export SAMS_ROUTER_MODE=balanced
export SAMS_ROUTER_LOG_PATH="$HOME/.omlx/router/sams-auto-router.jsonl"
bun run router:sam
```

Disable logs:

```bash
bun run router:sam -- --no-log
```

## Quality Retry

For small-model direct answers, the router checks for obvious failure patterns before returning:

- empty output
- visible scratchpad such as `<think>` or `call:thought`
- invalid JSON when JSON was requested
- obvious yes/no contradiction
- repetition loops
- length-limit truncation

If one of these trips, the router retries the request with 35B, returns the 35B answer, logs `BIG_RETRY`, and unloads 35B afterward.

## Related CPU Helpers

`busyBee-cpu` is relevant as a future policy-classifier direction: it routes mechanical agent actions on CPU and escalates when the LLM should take over.

`honey-comb` is relevant as a future context-compression layer: it can shrink noisy agent context before the request reaches the router.

Neither is required for this first router. The first version stays dependency-light and deterministic so it is easy to debug.
