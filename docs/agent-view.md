# Agent View and Background Sessions

OpenClaude Agent View is a terminal command center for running multiple independent OpenClaude sessions in the background from one place. It is modeled after the official Claude Code Agent View reference: https://code.claude.com/docs/en/agent-view.

This is not subagents and not agent teams. Each Agent View row is a whole background OpenClaude session. If one of those sessions starts subagents internally, those helpers stay inside that session and do not become separate dashboard rows.

## Commands

Open the Agent View/home dashboard:

```bash
openclaude-neo
openclaude agents
```

Use `openclaude-neo` for the dashboard-first workflow. It starts in Agent View by default and is the quickest way to launch, attach to, and monitor background sessions. Use `openclaude` when you want the normal chat-first CLI for provider setup, slash commands, `/server`, `/telegram`, or focused single-session work.

Start a background session from the shell:

```bash
openclaude --bg "fix the failing tests"
openclaude --bg "review the repo" --provider groq --model openai/gpt-oss-120b
openclaude --bg "fix tests" --provider openrouter --model openrouter/free
```

Manage a session:

```bash
openclaude-neo attach <id>
openclaude-neo logs <id>
openclaude attach <id>
openclaude logs <id>
openclaude stop <id>
openclaude respawn <id>
openclaude rm <id>
```

`openclaude-neo` also passes through `stop`, `respawn`, and `rm`.

Inside an interactive session:

```text
/bg run tests and fix failures
/background review this repo
/bg @code-reviewer review the last diff
```

`/bg` starts a new background session from the prompt you provide. It supports the same inline `--provider`, `--model`, `--permission-mode`, and leading `@agent-name` routing as the dashboard prompt. Moving the current live conversation into Agent View is not implemented yet.

## Dashboard

`openclaude agents` shows sessions grouped by state:

- Needs input
- Working
- Idle
- Completed
- Failed
- Stopped

Each row shows the short id, prompt-derived name, directory, provider/model when known, latest output summary, and age.

Keyboard shortcuts:

- `up` / `down`: move between rows
- `Enter`: dispatch a new session when the input has text, otherwise attach to the selected row
- `right`: open the selected session thread
- `space`: reply to the selected session thread
- `r`: respawn the selected session as a fresh background job
- `ctrl+x`: stop and delete the selected session record
- `left`: return to the normal chat when the dashboard prompt is empty
- `Esc`: close peek, clear input, or exit Agent View

Every prompt typed in Agent View creates a separate background session. It is not sent as a follow-up to the selected row.

## Flicker-Free Rendering

Agent View participates in OpenClaude's flicker-free TUI renderer by default. In a normal chat, press `left` on an empty prompt to open Agent View as a fixed dashboard overlay instead of rendering it inside the prompt area. The dashboard keeps its header fixed, clips the session list in the middle, and keeps the new-session input fixed at the bottom.

Running `openclaude agents` directly uses the same renderer. Use `/tui classic`, `openclaude agents --no-alt-screen`, or `CLAUDE_CODE_NO_FLICKER=0` when you want classic terminal scrollback instead.

Agent rows preserve their own model/provider metadata for context reporting. When OpenClaude knows a row's context window it shows `CTX N%`; when a local or custom provider does not expose the window it shows `CTX ?` instead of borrowing the main chat's model or displaying a fake zero.

You can put provider/model overrides at the start of a dashboard prompt:

```text
--provider groq --model openai/gpt-oss-120b review the repo
@code-reviewer review the repo
```

## Provider and Model Routing

Background session metadata stores the provider and model selected at launch. Shell dispatch supports:

```bash
openclaude --bg "review the repo" --provider groq --model openai/gpt-oss-120b
```

Those values are passed to the background runner and shown in Agent View. Separate jobs preserve their own provider/model metadata independently, so attaching to or inspecting one job does not overwrite another.

Dashboard-created sessions inherit dashboard-level provider/model defaults when supplied by the caller, and inline `--provider` / `--model` values override those defaults for that one new background session.

## Agent Routing

Agent View rows are whole OpenClaude sessions, not subagents. If you prefix a dashboard prompt, `/bg` prompt, or shell `--bg` prompt with a configured agent name like `@code-reviewer`, OpenClaude removes that prefix from the task prompt, stores `agent: code-reviewer` in the job metadata, and launches the background session with `--agent code-reviewer`.

Unknown agent names are passed through to OpenClaude's normal `--agent` handling, so failures stay visible in the job log rather than being silently rewritten.

## Persistence and Logs

Job metadata is stored under the OpenClaude user data directory:

```text
~/.openclaude/jobs/<id>/state.json
~/.openclaude/jobs/<id>/session.log
```

If `OPENCLAUDE_AGENTVIEW_HOME` is set, jobs use that directory. Otherwise, `OPENCLAUDE_HOME` is honored before falling back to the default OpenClaude config home. Logs and metadata are redacted for common API key and token patterns before being written.

## Attach Behavior

`openclaude attach <id>` opens an attached session view. It follows the background session output and lets you type follow-up messages into that same background session. The background session keeps running after you detach.

Each thread keeps its own provider/model metadata. Threads created from the in-app Agent View inherit the current main-thread model by default. In a thread, use `/model` for an interactive model picker, `/provider` for saved provider profiles, or pass a direct value like `/model <model-name>` or `/provider <profile-name>`.

Attach shortcuts:

- `Enter`: send the current attached prompt as a new user turn
- `/model`: open the thread model picker
- `/model <model-name>`: switch only this thread to a different model directly
- `/provider`: open the saved provider profile picker for this thread
- `/provider <profile-name>`: switch this thread to a saved provider profile directly
- `left` / `right`: detach back to Agent View when the attached prompt is empty
- `Esc`: detach back to Agent View when the attached prompt is empty, or clear a non-empty prompt
- `Ctrl+C`: leave attach without stopping the background session

This uses OpenClaude's stream-json input path rather than a full terminal PTY. Normal text follow-up turns work; fully interactive terminal UI state, `Ctrl+Z`, and replying to permission prompts from the dashboard are still future work.

## File Isolation

Background sessions launched from a git repository create an isolated git worktree at:

```text
.openclaude/worktrees/<id>
```

The dashboard still shows the original repo path plus model/provider metadata; the job metadata stores `worktree_path` and `worktree_branch`.

`openclaude rm <id>` removes the job record, not the worktree. That avoids deleting useful work without confirmation. Clean up worktrees with git once you have reviewed or merged the work.

## Future Work

- Full PTY attach/detach for exact normal REPL parity
- `/bg` migration for the current live conversation
- Permission reply handling from the dashboard
- `respawn --all`
