# Telegram Bridge Implementation Note

## Discovery Summary

### Current CLI entrypoint

- Main CLI entrypoint: [`src/main.tsx`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/main.tsx)
- Published binary shim: [`bin/openclaude`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/bin/openclaude)
- Headless print path: [`src/cli/print.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/cli/print.ts)
- Optional gRPC server path: [`scripts/start-grpc.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/scripts/start-grpc.ts) -> [`src/grpc/server.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/grpc/server.ts)

### Is `--channels` currently parsed?

Yes.

- `src/main.tsx` already defines:
  - `--channels <servers...>`
  - `--dangerously-load-development-channels <servers...>`
- Parsed entries are stored in bootstrap state via `setAllowedChannels(...)`.

### Is `--channels` currently functional?

Partially.

- Interactive MCP connection management already understands channel registration and inbound notifications:
  - [`src/services/mcp/channelNotification.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/services/mcp/channelNotification.ts)
  - [`src/services/mcp/useManageMCPConnections.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/services/mcp/useManageMCPConnections.ts)
- The headless print path also has channel code, but `handleChannelEnable(...)` in `src/cli/print.ts` is hard-blocked with:
  - `"channels feature not available in this build"`

So the flag is parsed and stored, but the control path needed for non-interactive/bridge use is currently blocked.

### Does OpenClaude already have plugin/channel abstractions?

Yes.

- Channel allowlist and gating:
  - [`src/services/mcp/channelAllowlist.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/services/mcp/channelAllowlist.ts)
  - [`src/services/mcp/channelNotification.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/services/mcp/channelNotification.ts)
- Inbound channel message format:
  - `notifications/claude/channel`
- Optional permission relay format:
  - `notifications/claude/channel/permission`
  - `notifications/claude/channel/permission_request`

This means OpenClaude already has a real channel protocol model, but not a built-in Telegram transport.

### Does OpenClaude already have task/subtask support suitable for `/btw`?

Yes, but only in the interactive UI path.

- `/btw` exists as a real local command:
  - [`src/commands/btw/btw.tsx`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/commands/btw/btw.tsx)
- It uses the side-question/forked-agent path:
  - [`src/utils/sideQuestion.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/utils/sideQuestion.ts)
  - [`src/utils/forkedAgent.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/utils/forkedAgent.ts)

This is promising semantically, but it is not exposed as a simple headless API we can safely call from Telegram without pulling in UI-specific command machinery.

### Smaller safe path

For v1, a built-in Telegram bridge command is smaller and safer than trying to finish native generic `--channels` support end to end.

Why:

- `--channels` currently assumes MCP channel plugins and allowlist/policy behavior.
- There is no built-in Telegram transport in this repo.
- Finishing native `--channels` properly would require:
  - plugin installation/runtime expectations
  - control-request plumbing for headless mode
  - MCP channel enable lifecycle in print/headless mode
  - more policy/allowlist edge cases

By contrast, the repo already ships a simple local headless gRPC service that:

- holds session state via `session_id`
- streams text chunks
- emits permission prompts
- supports cancellation

That makes a dedicated bridge command the most stable first version.

## Recommended v1

Implement:

- `openclaude telegram`

Behavior:

- Uses Telegram long polling
- Connects only to the local gRPC server
- Requires one exact allowed Telegram user ID
- Requires an explicit safe workspace
- Supports `/status`, `/pause`, `/resume`, `/stop`, `/ask`, `/btw`
- Streams text chunks back to Telegram in throttled edits plus final chunked sends
- Treats `/btw` as a constrained side investigation prompt for v1:
  - no file edits by default
  - no destructive commands
  - concise answer only

This preserves normal CLI behavior and avoids destabilizing the existing interactive session path.

## Planned Files To Change

### New files

- [`src/telegram/bridge.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/bridge.ts)
- [`src/telegram/client.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/client.ts)
- [`src/telegram/commands.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/commands.ts)
- [`src/telegram/config.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/config.ts)
- [`src/telegram/grpcClient.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/grpcClient.ts)
- [`src/telegram/messageChunking.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/messageChunking.ts)
- [`src/telegram/workspace.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/workspace.ts)
- [`src/telegram/types.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/types.ts)
- [`src/telegram/__tests__/commands.test.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/__tests__/commands.test.ts)
- [`src/telegram/__tests__/config.test.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/__tests__/config.test.ts)
- [`src/telegram/__tests__/messageChunking.test.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/__tests__/messageChunking.test.ts)
- [`src/telegram/__tests__/workspace.test.ts`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/telegram/__tests__/workspace.test.ts)
- [`docs/telegram.md`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/docs/telegram.md)
- [`.env.example`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/.env.example)

### Existing files

- [`src/main.tsx`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/src/main.tsx)
  - add `telegram` subcommand
- [`package.json`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/package.json)
  - add focused test/docs scripts only if needed
- [`README.md`](/Users/samstamatiou/Documents/Codex/2026-04-19-here-s-a-short-x-update/openclaude/README.md)
  - add bridge docs section and pointer to `docs/telegram.md`

## Notes On Official References

The implementation direction is based on:

- Claude Code Channels docs:
  - external messages enter a running session
  - replies go back through the same channel
  - lifecycle is tied to the CLI session
- Channels reference:
  - two-way channels expose a reply tool
  - sender gating and permission relay are explicit responsibilities
- Anthropic Telegram plugin docs:
  - BotFather token
  - pairing / access control
  - long-running session requirement

For this repo, v1 will intentionally stop short of the full MCP channel/plugin path and instead implement the smallest local bridge that preserves the same safety shape.
