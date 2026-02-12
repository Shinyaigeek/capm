# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sibyl is a CLI package manager for Claude Code skills, agents, and commands. It installs packages from GitHub repositories by cloning, storing locally in `.sibyl/store/`, and symlinking into `.claude/` directories.

## Commands

- **Build:** `pnpm run build` (runs `tsc`)
- **Test all:** `pnpm run test` (runs `vitest run`)
- **Test watch:** `pnpm run test:watch`
- **Test single file:** `pnpm vitest run src/__tests__/spec.test.ts`
- **Lint:** `pnpm run lint` (runs `biome check .`)
- **Lint fix:** `pnpm run lint:fix` (runs `biome check --write .`)
- **Format:** `pnpm run format` (runs `biome format --write .`)

## Architecture

### Spec Format

Packages are referenced as `<org>/<repo>/<path>[@<ref>]` (e.g., `affaan-m/everything-claude-code/skills/tdd-workflow@main`). Parsed by `src/spec.ts`.

### Package Types

Three types with different linking behavior:
- **skill** — entire directory symlinked into `.claude/skills/`
- **agent** — individual `.md` file symlinked into `.claude/agents/`
- **command** — individual `.md` file symlinked into `.claude/commands/`

### Pipeline: install → store → link → lock

1. **git.ts** — shallow-clones a GitHub repo at a ref or commit
2. **store.ts** — copies the relevant path into `.sibyl/store/<org>/<repo>/<commit>/<path>/`
3. **linker.ts** — creates relative symlinks from `.claude/<type>/` to the store; manages `.gitignore` entries in a "managed by sibyl" section
4. **lockfile.ts** — records the install in `sibyl-lock.json` (atomic writes via temp-file + rename)

### CLI Structure (`src/cli.ts`)

Uses `commander`. Each package type (`skill`, `agent`, `command`) is a subcommand group with actions: `i` (install), `ls` (list), `rm` (uninstall), `update`. Top-level `i` restores all from lockfile; top-level `update` updates all or filtered packages.

### Commands (`src/commands/`)

- **install.ts** — install a single package by spec
- **uninstall.ts** — remove symlinks, store entry, and lockfile entry
- **restore.ts** — restore all packages from lockfile, grouping by org/repo/commit to minimize clones
- **update.ts** — update packages to latest commit on their tracked ref
- **list.ts** — display installed packages

### Conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution
- Biome for linting/formatting (2-space indent, 100-char line width)
- Vitest with global test APIs (no imports needed for `describe`/`it`/`expect`)
- Tests use temp directories with `beforeEach`/`afterEach` cleanup
- Logging in `src/log.ts` respects `NO_COLOR`/`FORCE_COLOR` env vars; spinner on stderr, output on stdout
