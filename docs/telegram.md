# Telegram Bridge

OpenClaude now supports two Telegram workflows:

- in-session Telegram access with `/telegram` and `/telegram setup`
- a standalone local bridge command with `openclaude telegram`

The in-session flow is the smallest way to let your phone talk to the live REPL you already have open.

The standalone bridge is still useful when you want Telegram to talk to the headless OpenClaude gRPC server instead of a live terminal session.

## In-session Telegram

Launch OpenClaude normally, then inside the session use:

```text
/telegram setup
```

That walks you through the required environment variables and BotFather steps from inside OpenClaude.

Once the env vars are set and you relaunch OpenClaude, use:

```text
/telegram
```

to toggle Telegram access for the live session on or off.

Useful session commands:

```text
/telegram
/telegram on
/telegram off
/telegram status
/telegram setup
```

Current behavior of the in-session bridge:

- Telegram messages reach the active OpenClaude session
- `/btw <prompt>` answers a Telegram-native side question in Telegram
- `/btw <prompt>` does not open the local `/btw` panel or interrupt the main conversation
- `/dismiss` closes the current local OpenClaude overlay only
- replies are sent back to Telegram after the turn completes
- tool approvals still happen locally in OpenClaude for now
- the bot token and allowed Telegram user ID are saved globally
- the workspace defaults to the directory this OpenClaude session was opened in

## Standalone bridge

OpenClaude can also run a small local Telegram bridge that forwards messages from a single allowed Telegram user into the headless OpenClaude gRPC server.

This is a local-first bridge:

- Telegram long polling only
- no public webhook
- no secrets stored in repo files
- one explicit allowed Telegram user ID
- one explicit workspace
- no automatic approval of tool or shell actions

## What this v1 does

- `/status` shows workspace, pause state, active run, model, provider, local overlay state, and task visibility where available
- `/tasks` is a status shortcut focused on the same task visibility
- `/pause` blocks new prompts
- `/resume` accepts prompts again
- `/stop` cancels the active run
- `/dismiss` closes the current local OpenClaude overlay only
- `/ask <prompt>` sends a normal prompt
- `/btw <prompt>` answers a Telegram-native side question without opening local UI
- `/model` or `/models` shows the active model
- `/model <name>` or `/models <name>` switches models
- plain text defaults to `/ask`
- permission prompts still require local approval in OpenClaude

## Safety model

- Only `TELEGRAM_ALLOWED_USER_ID` may interact with the bot
- Unauthorized users are ignored
- `OPENCLAUDE_WORKSPACE_DIR` or `WORKSPACE_DIR` is required
- The workspace must exist and cannot be `/` or your home directory directly
- By default the bridge only connects to loopback gRPC targets:
  - `127.0.0.1`
  - `localhost`
  - `::1`
- `0.0.0.0` or other remote hosts require:
  - `OPENCLAUDE_ALLOW_UNSAFE_GRPC=1`

## BotFather setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Run `/newbot`
3. Pick a display name
4. Pick a username ending in `bot`
5. Copy the bot token

## Required environment

Set these in your shell or a local uncommitted `.env`:

```bash
export TELEGRAM_BOT_TOKEN="123456789:abcdef..."
export TELEGRAM_ALLOWED_USER_ID="123456789"
export OPENCLAUDE_WORKSPACE_DIR="/absolute/path/to/project"
export OPENCLAUDE_GRPC_HOST="127.0.0.1"
export OPENCLAUDE_GRPC_PORT="50051"
```

Optional:

```bash
export OPENCLAUDE_ALLOW_UNSAFE_GRPC="1"
```

## Start the gRPC server

In one terminal:

```bash
npm run dev:grpc
```

This starts the headless OpenClaude gRPC server on `localhost:50051` by default.

## Start the Telegram bridge

In another terminal:

```bash
node dist/cli.mjs telegram
```

Or during local development:

```bash
bun run dev -- telegram
```

## Example flow

DM the bot:

```text
/status
/tasks
/btw what repo am I in?
/ask summarize this project
```

If a tool permission prompt is required, approve it locally in OpenClaude for now. Telegram approval commands are intentionally not exposed until the live permission relay is wired.

```text
Approve locally in OpenClaude.
```

## `/btw` behavior

`/btw <prompt>` is a first-class Telegram command for side questions.

- it answers back in Telegram
- it does not submit `/btw` into the local OpenClaude prompt
- it does not open the local `/btw` modal
- it does not interrupt the main OpenClaude conversation
- it runs through the side-question engine with no tool use
- it keeps answers concise for phone-sized reading

Use `/ask <prompt>` when you want to send work into the live OpenClaude session. Use `/btw <prompt>` when you want a side answer without changing the local conversation flow.

## Troubleshooting

### Bot does not reply

- confirm the bridge process is running
- confirm the gRPC server is running
- confirm `TELEGRAM_ALLOWED_USER_ID` matches your numeric Telegram user ID

### Bridge refuses to start

Common causes:

- missing `TELEGRAM_BOT_TOKEN`
- missing `TELEGRAM_ALLOWED_USER_ID`
- missing `OPENCLAUDE_WORKSPACE_DIR` or `WORKSPACE_DIR`
- workspace path points to `/` or your home directory
- gRPC host is non-loopback without `OPENCLAUDE_ALLOW_UNSAFE_GRPC=1`

### Permission prompts do not work

- make sure the gRPC server is the component generating the run
- reply with the exact short approval ID shown by the bot

## Warning

Do not bind the headless OpenClaude gRPC server to `0.0.0.0` without authentication or another explicit protective layer.
