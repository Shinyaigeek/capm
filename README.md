# capm

A package manager for [Claude Code](https://claude.ai/code) skills, agents, and commands.

---

## Install

```sh
npm i -g capm
```

## Usage

```sh
# Install a skill
capm skill i affaan-m/everything-claude-code/skills/tdd-workflow

# Install an agent
capm agent i affaan-m/everything-claude-code/agents/planner.md

# Install a command
capm command i affaan-m/everything-claude-code/commands/multi-plan.md

# Pin to a specific branch or tag
capm skill i affaan-m/everything-claude-code/skills/tdd-workflow@v2
```

Packages are referenced using a spec format:

```
<org>/<repo>/<path>[@<ref>]
```

`ref` defaults to `main` when omitted.

## Commands

| Command | Description |
|---|---|
| `capm skill i <spec>` | Install a skill |
| `capm agent i <spec>` | Install an agent |
| `capm command i <spec>` | Install a command |
| `capm <type> ls` | List installed packages |
| `capm <type> rm <name>` | Uninstall a package |
| `capm <type> update [filter]` | Update packages of a type |
| `capm i` | Restore all packages from lockfile |
| `capm update [filter]` | Update all packages |

`filter` narrows updates to a specific `org/repo` or `org/repo/path`.

## How it works

```
                  ┌──────────┐
  capm skill i    │  GitHub  │   shallow clone at ref
  ─────────────── │   repo   │ ◄─────────────────────
                  └────┬─────┘
                       │
                       ▼
              .capm/store/<org>/<repo>/<commit>/<path>/
                       │
                       │  relative symlink
                       ▼
              .claude/skills/<name>  →  ../../.capm/store/...
```

1. **Clone** — shallow-clones the GitHub repo at the given ref
2. **Store** — copies the target path into `.capm/store/`
3. **Link** — creates relative symlinks under `.claude/skills/`, `.claude/agents/`, or `.claude/commands/`
4. **Lock** — records the exact commit in `capm-lock.json` for reproducible restores

The lockfile ensures `capm i` can restore every package at the exact same commit, even across machines.

## License

ISC
