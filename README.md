# ⚖️ sibyl

A package manager for [Claude Code](https://claude.ai/code) skills, agents, and commands.

---

## Install

```sh
npm i -g sibyl
```

## Usage

```sh
# Install a skill
sibyl skill i affaan-m/everything-claude-code/skills/tdd-workflow

# Install an agent
sibyl agent i affaan-m/everything-claude-code/agents/planner.md

# Install a command
sibyl command i affaan-m/everything-claude-code/commands/multi-plan.md

# Pin to a specific branch or tag
sibyl skill i affaan-m/everything-claude-code/skills/tdd-workflow@v2
```

Packages are referenced using a spec format:

```
<org>/<repo>/<path>[@<ref>]
```

`ref` defaults to `main` when omitted.

## Commands

| Command | Description |
|---|---|
| `sibyl skill i <spec>` | Install a skill |
| `sibyl agent i <spec>` | Install an agent |
| `sibyl command i <spec>` | Install a command |
| `sibyl <type> ls` | List installed packages |
| `sibyl <type> rm <name>` | Uninstall a package |
| `sibyl <type> update [filter]` | Update packages of a type |
| `sibyl i` | Restore all packages from lockfile |
| `sibyl update [filter]` | Update all packages |

`filter` narrows updates to a specific `org/repo` or `org/repo/path`.

## How it works

```
                  ┌──────────┐
  sibyl skill i   │  GitHub  │   shallow clone at ref
  ─────────────── │   repo   │ ◄─────────────────────
                  └────┬─────┘
                       │
                       ▼
              .sibyl/store/<org>/<repo>/<commit>/<path>/
                       │
                       │  relative symlink
                       ▼
              .claude/skills/<name>  →  ../../.sibyl/store/...
```

1. **Clone** — shallow-clones the GitHub repo at the given ref
2. **Store** — copies the target path into `.sibyl/store/`
3. **Link** — creates relative symlinks under `.claude/skills/`, `.claude/agents/`, or `.claude/commands/`
4. **Lock** — records the exact commit in `sibyl-lock.json` for reproducible restores

The lockfile ensures `sibyl i` can restore every package at the exact same commit, even across machines.

## License

ISC
