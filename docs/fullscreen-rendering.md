# Fullscreen rendering

OpenClaude has a flicker-free fullscreen renderer modeled after Claude Code's
alternate-screen mode:

- `FullscreenLayout` pins the prompt and footer at the bottom.
- `ScrollBox` owns conversation scrolling instead of relying on terminal
  scrollback.
- Mouse tracking enables wheel scrolling, text selection, URL/path clicks, and
  expandable message/tool rows.
- `Ctrl+o` opens transcript mode for search/review and for returning content to
  native terminal workflows.

## User command

Use `/tui` to inspect or switch the renderer:

```text
/tui
/tui fullscreen
/tui default
```

`/tui fullscreen` writes the same `flickerFreeMode` setting exposed in
`/config`. `CLAUDE_CODE_NO_FLICKER=1` and `CLAUDE_CODE_NO_FLICKER=0` still take
process-level precedence, so `/tui` reports when an environment override is in
effect.

Set `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` to force the classic renderer for a
process regardless of the saved `/tui` setting.

## Claude parity checklist

Implemented or mostly present:

- Alternate-screen fullscreen renderer
- Fixed bottom prompt area
- Virtualized message scrollback
- Mouse wheel scrolling
- In-app selection and copy-on-select setting
- URL/path click handling
- Click-to-expand collapsible tool output
- `Ctrl+o` transcript mode with search/review affordances
- `CLAUDE_CODE_DISABLE_MOUSE=1`
- `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`
- `CLAUDE_CODE_SCROLL_SPEED`
- tmux mouse hint and tmux `-CC` guard

Useful follow-up slices:

1. Add an interactive `/scroll-speed` dialog that persists scroll speed into the
   OpenClaude config instead of requiring the environment variable.
2. Add `/focus` parity if brief transcript mode should become a user-visible
   command in external builds.
3. Expand terminal QA notes for iTerm2, Ghostty, WezTerm, VS Code, and tmux.
4. Add integration tests around `/tui` command registration and renderer status
   text once the broader command/typecheck noise is cleaned up.
