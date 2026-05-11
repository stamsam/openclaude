# Learning

OpenClaude learning is lightweight, local, and user-controlled.

- `/learn` previews pending memory, skill, and cleanup candidates and mutates nothing.
- `/learn run` applies safe candidates, archives processed queue items, and writes a report.
- Passive collection writes local evidence and candidates, but it does not mutate long-term memory automatically.
- `MEMORY.md` stores compact project/workflow facts. Limit: 2500 characters.
- `USER.md` stores user preferences only. Limit: 1500 characters. Sensitive facts are not auto-saved.
- Learned skills are procedural drafts under `skills/<skill-slug>/`.
- No Obsidian integration is required or performed.
- Loreforge is not required in v1; files are portable for later import/export.

Default storage root: `~/.openclaude/`.

Overrides:

- `OPENCLAUDE_HOME`
- `OPENCLAUDE_MEMORY_DIR`
- `OPENCLAUDE_SKILLS_DIR`
- `OPENCLAUDE_LEARN_NUDGE_EVERY=0` disables session nudges.

Safety rules:

- Preview mode writes nothing.
- Apply mode is the only writer.
- Secrets are redacted before storage.
- Existing skills are preserved with `proposed_patch-<date>.md`.
- Archived skills are not loaded into the prompt snapshot.
- `/learn run` uses OpenClaude's active provider/model and does not require another API key.
