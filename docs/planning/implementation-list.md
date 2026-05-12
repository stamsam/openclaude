# Implementation List

## Research: Adapt Agent CLI Ideas

Review OpenAI Codex, OpenCode, Hermes Agent, and Gemini CLI for practical
features worth adapting into this OpenClaude fork.

Priority areas:

- Make `/goal` more reliable, safer, and useful for long-running work.
- Make `/learn` more reviewable, searchable, and project-aware.
- Improve Telegram bridge safety and remote-control ergonomics.
- Add clearer permissions, trusted folders, sandboxing, checkpoint/restore, and
  background-process visibility.
- Prefer features that fit the existing TypeScript/Ink/OpenClaude architecture
  without requiring a full runtime rewrite.

Requested output:

- feature description
- why it helps this fork
- which existing feature it improves
- implementation size: quick, medium, or big
- risks or complexity
- recommended order

## Ranked Candidates From Review

1. Trusted project config and permission profiles
   - Sources: OpenAI Codex project trust/config, Gemini folder trust/settings,
     OpenCode permissions.
   - Helps: gives `/goal`, `/learn`, Telegram, local models, web search, and
     slash commands one coherent policy layer instead of scattered env vars.
   - Size: medium.

2. `/restore`-style pre-edit checkpoints
   - Source: Gemini CLI checkpointing and `/restore`.
   - Helps: makes `/goal` safe to run autonomously by snapshotting files before
     edits and restoring both files and conversation state if needed.
   - Size: medium to big.

3. Read-only planning/exploration modes for `/goal`
   - Sources: Gemini `/plan`, OpenCode plan/explore/scout agents.
   - Helps: goals can begin in read-only audit mode, then ask before switching
     to implementation mode.
   - Size: medium.

4. Event/notification bus
   - Sources: OpenAI Codex `notify`, OpenCode SSE event stream, Hermes gateway
     progress notifications.
   - Helps: Telegram, footer, background jobs, approvals, and goal progress can
     subscribe to the same events.
   - Size: medium.

5. Hierarchical memory and `/memory` inspection
   - Sources: Gemini hierarchical `GEMINI.md`, Hermes bounded MEMORY/USER stores.
   - Helps: turns `/learn` from passive queue files into inspectable project,
     user, and skill context with clear scope and capacity.
   - Size: medium.

6. Custom command loading from project/user files
   - Sources: Gemini TOML commands, OpenCode command templates.
   - Helps: lets repeatable workflows become `/commands` without code changes;
     useful for project-specific test, review, and release flows.
   - Size: quick to medium.

7. Background shell/process visibility
   - Sources: Gemini `/shells`, Hermes background session/tool progress.
   - Helps: makes long-running dev servers, tests, and goal-spawned processes
     visible and manageable.
   - Size: medium.

8. Recurring/background jobs
   - Source: Hermes cron jobs.
   - Helps: lets OpenClaude schedule checks, learning reviews, benchmark sweeps,
     and reminders, with output delivered to Telegram or local files.
   - Size: big.

9. Headless server/client event API
   - Source: OpenCode server/client architecture.
   - Helps: turns Telegram and future UIs into clients of one local OpenClaude
     server instead of parallel bridges.
   - Size: big.

10. Tool output truncation and status configuration
    - Sources: Gemini footer settings, shell output efficiency, model/tool stats.
    - Helps: keeps footer/status readable and prevents `/goal` or shell output
      from overwhelming context.
    - Size: quick to medium.

## Implementation Status

- Done: `/goal` now routes new/resumed goals through existing `/plan` mode by
  default, while `/goal act` keeps a direct continuation path.
- Done: `/goal` completion is based on objective, success criteria, and
  concrete `Evidence:` in `GOAL_COMPLETE`, not advisory checklist completion.
- Done: `/goal checkpoint` records goal checkpoints and calls the existing file
  history snapshot path when available.
- Done: `/goal restore` opens the existing `/rewind` restore picker.
- Done: `/goal tasks` opens the existing `/tasks` background task manager.
- Done: goal lifecycle changes emit typed internal events for later Telegram,
  status, cron, or notification subscribers.
- Done: `/learn` preview/run reports show the active memory and skill scopes.
- Done: learned skill drafts now write `SKILL.md` frontmatter compatible with
  the existing user skill loader.
- Done: Telegram `/status`, `/task`, and `/tasks` show bridge status plus task
  visibility where available.
- Done: friendly `/cron` command now lists, adds, and deletes scheduled prompt
  jobs on top of the existing cron primitives.

## Manual Live Test List

- Telegram bridge, basic commands: in a real running terminal session with bot
  config loaded, send `/status`, `/tasks`, `/task`, `/btw <prompt>`,
  `/approve <id>`, `/dismiss`, and `/stop`; verify task visibility appears,
  busy/idle state is accurate, approvals still require explicit confirmation,
  and long responses are chunked safely.
- Telegram bridge, live session routing: send a normal prompt from Telegram and
  verify it reaches the active terminal session and replies back to Telegram.
  Then send `/btw <prompt>` and verify it replies only through Telegram without
  opening the local `/btw` modal. During a slow `/btw`, send `/stop` and verify
  it cancels the Telegram side question cleanly.
- Telegram bridge, stop semantics: while a Telegram-owned run is active, send
  `/stop` and verify that run cancels. While local terminal work is active but
  Telegram does not own the run, send `/stop` and verify it does not abort local
  work.
- Telegram bridge, config refresh: run `/telegram setup` or toggle `/telegram
  on` after changing workspace/config, then send `/status` again and verify the
  bridge reflects the new workspace without restarting OpenClaude.
- `/goal` live footer: start a goal, let it run long enough for the bottom-right
  footer to update, then complete, pause, clear, or end the session and verify
  the goal timer/token footer stops instead of continuing after the session.
- `/goal` plan semantics: have the assistant emit a `GOAL_PLAN:` block with all
  items marked done and verify `/goal` still stays active. Then complete with
  `GOAL_COMPLETE` plus `Evidence:` and verify the goal becomes complete only at
  that point.
- `/learn` preview/run: use `/learn` to preview candidates and verify preview
  does not write memory or skill files. Then run `/learn run` and verify safe
  repeated items promote while one-off or uncertain items stay queued for the
  next `/learn` review.
- oMLX `/model` refresh: add or remove an oMLX model, open `/model` on the
  `omlx` preset, and verify the model list refreshes on open. Repeat on the
  `omlx-anthropic` preset and verify the same local model catalog is available.
- oMLX benchmark: from a normal OpenClaude session, run `/benchmark <local
  model name>` with the OpenAI-compatible oMLX route and verify it reports TPS,
  first-token latency, and a success mark without requiring `OPENAI_API_KEY`.
- oMLX settings fallback: start OpenClaude without `OMLX_API_KEY` in the shell,
  with valid `~/.omlx/settings.json`, and verify model discovery/doctor still
  works through the stored oMLX settings.
