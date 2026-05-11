# Fork Map

Use this when applying upstream patches.

- Package name: `@gitlawb/openclaude` -> `openclaude-private`
- Repository URL: `https://github.com/Gitlawb/openclaude` -> `https://github.com/stamsam/openclaude-private`
- GitHub issues/discussions: same repo change as above
- Install docs: npm publish flow -> clone this repo and run `bun install`
- Source app links: point at `stamsam/openclaude-private`

Core app behavior is unchanged unless the patch explicitly touches runtime logic.
