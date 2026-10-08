# Claude Mod

Desktop look in terminal. A Claude Code mod that restyles the terminal to resemble the Claude desktop app: a welcome stats card, chat bubbles, bullet-free replies, compact tool rows and a Changes sidebar.

The install id is `desktop-look`, since Claude Code reserves plugin names that start with `claude-`.

Tested with Claude Code **2.1.288**. Mods need 2.1.287 or newer in the terminal, or 2.1.286 or newer in the Desktop app's Code tab. The render surfaces this mod uses are marked early access, so a newer build can change them without notice.

## Install

```bash
claude plugin marketplace add albertzhangz10/claude-mod
claude plugin install desktop-look@desktop-look-marketplace
```

To update later:

```bash
claude plugin update desktop-look@desktop-look-marketplace
```

## Configure

One optional setting, `name`, which appears in the welcome greeting ("What's up next, Sam?"). Set it through `/config` or the `/plugin` config dialog. Leave it blank and the greeting just reads "What's up next?".

Settings are stored per install id, so they do not travel with the repo. Everyone sets their own.

## What it does to your machine

Mods are not sandboxed. They run with your full user permissions. Inspect this one before installing, which reports its surface without executing any code:

```bash
claude plugin validate .
```

For this mod that prints:

```
❯ ./register.tsx hooks: ui.render{component=AbovePrompt}, session.start,
  command.run{command=changes}, tool.call, ui.render{component=UserMessage},
  ui.render{component=AssistantMessage}, ui.render{component=ToolUse},
  ui.render{component=Pane, requestId=desktop-look-changes}
❯ ./register.tsx calls: $.clock.now, $.command.register, $.env.get, $.fs.read,
  $.session.turns, $.state.get, $.state.set, $.ui.open, $.ui.resolve
❯ ./register.tsx env reads: HOME
❯ ./register.tsx env writes: nothing
```

No process spawning, no network, no credential store access.

## If it appears to do nothing

Hooks run as soon as the plugin is installed and enabled, with no separate approval step. Three things switch them off:

- `"disableAllHooks": true` in settings
- running with `--safe-mode` or `--bare`
- managed settings in a corporate environment, specifically `allowManagedModsOnly` or `allowManagedHooksOnly`

## Development

No build step. Claude Code loads the `.tsx` hook modules directly, and `tsconfig.json` is type checking only.

Work against a live directory so edits hot reload:

```bash
claude --plugin-dir /path/to/desktop-look
```

An installed copy is cached by version, so edits will not show up there until you bump `version` in `.claude-plugin/plugin.json` and reinstall. That version bump is also what releases an update to anyone who installed from the marketplace. Pushing commits without changing `version` reaches nobody.

Two notes on types:

- `types/index.d.ts` is hand written and required, because the mod uses `$.state`. It is committed.
- `.claude-plugin/types/` is generated per Claude Code version and is git ignored. `tsconfig.json` extends it, so on a fresh clone `tsc` fails until you load the mod once with `--plugin-dir`, which regenerates the directory.

Because `marketplace.json` and `plugin.json` share the `.claude-plugin/` directory, `claude plugin validate .` reports on the marketplace manifest only. To validate the plugin and its hooks, copy the directory elsewhere, delete `marketplace.json` from the copy, and validate that.

Tests live in `hooks/*.test.ts` and `hooks/*.test.tsx`:

```bash
claude plugin test .
```

This needs an unwrapped `claude` on `PATH`. Some corporate installs wrap the binary and inject options ahead of the subcommand, which makes `plugin test` fail to parse.
