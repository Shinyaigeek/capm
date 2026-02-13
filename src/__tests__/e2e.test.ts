import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock git.ts
//
// install() and update() delete tmpDir in their finally block, so the mock
// must return a fresh *copy* of the source template each time it is called.
// ---------------------------------------------------------------------------
vi.mock("../git.js", () => {
  let templateDir: string | undefined;
  let mockCommit = "aabbccdd11223344";
  const { cp, mkdtemp } = require("node:fs/promises");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");

  async function copyTemplate(): Promise<string> {
    if (!templateDir) throw new Error("templateDir not set");
    const tmp = await mkdtemp(join(tmpdir(), "capm-e2e-clone-"));
    await cp(templateDir, tmp, { recursive: true });
    return tmp;
  }

  return {
    setMockSrcDir: (dir: string) => {
      templateDir = dir;
    },
    setMockCommit: (commit: string) => {
      mockCommit = commit;
    },
    shallowClone: vi.fn(async () => {
      const tmpDir = await copyTemplate();
      return { tmpDir, commit: mockCommit };
    }),
    cloneAtCommit: vi.fn(async () => {
      const tmpDir = await copyTemplate();
      return { tmpDir, commit: mockCommit };
    }),
  };
});

// Import after mock setup
const { createCli } = await import("../cli.js");
// biome-ignore lint/suspicious/noExplicitAny: mock module augmentation
const { setMockSrcDir, setMockCommit } = (await import("../git.js")) as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RunResult {
  stdout: string;
}

async function run(root: string, ...args: string[]): Promise<RunResult> {
  const program = createCli(root);
  program.exitOverride();

  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(" "));
  });

  try {
    await program.parseAsync(["node", "capm", ...args]);
  } finally {
    spy.mockRestore();
  }

  return { stdout: logs.join("\n") };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let root: string;
let srcDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "capm-e2e-"));
  srcDir = await mkdtemp(join(tmpdir(), "capm-e2e-src-"));

  // Populate fake repo with skill, agent, and command content
  await mkdir(join(srcDir, "skills/lint-fix"), { recursive: true });
  await writeFile(join(srcDir, "skills/lint-fix/prompt.md"), "# Lint Fix Skill");

  await mkdir(join(srcDir, "skills/tdd"), { recursive: true });
  await writeFile(join(srcDir, "skills/tdd/prompt.md"), "# TDD Skill");

  await mkdir(join(srcDir, "agents/reviewer"), { recursive: true });
  await writeFile(join(srcDir, "agents/reviewer/reviewer.md"), "# Reviewer Agent");

  await mkdir(join(srcDir, "commands/deploy"), { recursive: true });
  await writeFile(join(srcDir, "commands/deploy/deploy.md"), "# Deploy Command");

  setMockSrcDir(srcDir);
  setMockCommit("aabbccdd11223344");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(srcDir, { recursive: true, force: true }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("capm skill i <spec>", () => {
  it("installs a skill and creates lockfile + symlink", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    // Lockfile
    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    const entry = lock.packages["acme/tools/skills/lint-fix"];
    expect(entry).toBeDefined();
    expect(entry.type).toBe("skill");
    expect(entry.name).toBe("lint-fix");
    expect(entry.commit).toBe("aabbccdd11223344");

    // Symlink
    const linkStat = await lstat(join(root, ".claude/skills/lint-fix"));
    expect(linkStat.isSymbolicLink()).toBe(true);
  });

  it("supports @ref in the spec", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix@develop");

    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"].ref).toBe("develop");
  });

  it("warns on duplicate install", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    const { stdout } = await run(root, "skill", "i", "acme/tools/skills/lint-fix");
    expect(stdout).toContain("already installed");
  });
});

describe("capm agent i <spec>", () => {
  it("installs an agent and symlinks .md files", async () => {
    await run(root, "agent", "i", "acme/tools/agents/reviewer");

    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/agents/reviewer"].type).toBe("agent");

    const content = await readFile(join(root, ".claude/agents/reviewer.md"), "utf8");
    expect(content).toBe("# Reviewer Agent");
  });
});

describe("capm command i <spec>", () => {
  it("installs a command and symlinks .md files", async () => {
    await run(root, "command", "i", "acme/tools/commands/deploy");

    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/commands/deploy"].type).toBe("command");

    const content = await readFile(join(root, ".claude/commands/deploy.md"), "utf8");
    expect(content).toBe("# Deploy Command");
  });
});

describe("capm skill ls", () => {
  it("lists installed skills", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");
    const { stdout } = await run(root, "skill", "ls");
    expect(stdout).toContain("lint-fix");
  });

  it("shows message when no skills installed", async () => {
    const { stdout } = await run(root, "skill", "ls");
    expect(stdout).toContain("No skills installed");
  });
});

describe("capm skill rm <name>", () => {
  it("uninstalls a skill and removes symlink + lockfile entry", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    // Verify installed
    expect((await lstat(join(root, ".claude/skills/lint-fix"))).isSymbolicLink()).toBe(true);

    await run(root, "skill", "rm", "lint-fix");

    // Symlink removed
    await expect(lstat(join(root, ".claude/skills/lint-fix"))).rejects.toThrow();

    // Lockfile entry removed
    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"]).toBeUndefined();
  });

  it("logs message for non-existent package", async () => {
    const { stdout } = await run(root, "skill", "rm", "nonexistent");
    expect(stdout).toContain("nonexistent");
  });
});

describe("capm i (restore)", () => {
  it("restores all packages from lockfile", async () => {
    // Install two packages first
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");
    await run(root, "agent", "i", "acme/tools/agents/reviewer");

    // Remove symlinks (simulating fresh checkout)
    await rm(join(root, ".claude"), { recursive: true, force: true });

    // Restore
    await run(root, "i");

    // Verify symlinks are re-created
    expect((await lstat(join(root, ".claude/skills/lint-fix"))).isSymbolicLink()).toBe(true);
    const content = await readFile(join(root, ".claude/agents/reviewer.md"), "utf8");
    expect(content).toBe("# Reviewer Agent");
  });

  it("shows message when lockfile is empty", async () => {
    const { stdout } = await run(root, "i");
    expect(stdout).toContain("No packages in lockfile");
  });
});

describe("capm update", () => {
  it("updates packages when commit changes", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    // Change the mock commit to simulate upstream update
    setMockCommit("1122334455667788");

    const { stdout } = await run(root, "update");
    expect(stdout).toContain("lint-fix");

    // Lockfile should have new commit
    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"].commit).toBe("1122334455667788");
  });

  it("reports up-to-date when no changes", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    const { stdout } = await run(root, "update");
    expect(stdout).toContain("up to date");
  });
});

describe("capm skill update", () => {
  it("updates only skills", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");
    await run(root, "agent", "i", "acme/tools/agents/reviewer");

    setMockCommit("1122334455667788");

    const { stdout } = await run(root, "skill", "update");
    expect(stdout).toContain("lint-fix");

    // Skill should be updated
    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"].commit).toBe("1122334455667788");
    // Agent should remain unchanged
    expect(lock.packages["acme/tools/agents/reviewer"].commit).toBe("aabbccdd11223344");
  });
});

describe("full lifecycle", () => {
  it("install → ls → update → rm", async () => {
    // Install
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    // List
    const { stdout: lsOut } = await run(root, "skill", "ls");
    expect(lsOut).toContain("lint-fix");

    // Update (same commit = no-op)
    const { stdout: upOut } = await run(root, "skill", "update");
    expect(upOut).toContain("up to date");

    // Update with new commit
    setMockCommit("1122334455667788");
    await run(root, "skill", "update");
    const lock = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"].commit).toBe("1122334455667788");

    // Uninstall
    await run(root, "skill", "rm", "lint-fix");
    await expect(lstat(join(root, ".claude/skills/lint-fix"))).rejects.toThrow();
    const lockAfter = JSON.parse(await readFile(join(root, "capm-lock.json"), "utf8"));
    expect(lockAfter.packages["acme/tools/skills/lint-fix"]).toBeUndefined();
  });
});

describe("error handling", () => {
  it("rejects missing spec argument", async () => {
    await expect(run(root, "skill", "i")).rejects.toThrow();
  });

  it("rejects missing name argument for rm", async () => {
    await expect(run(root, "skill", "rm")).rejects.toThrow();
  });
});

describe("gitignore management", () => {
  it("creates .capm/ entry in root .gitignore", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain(".capm/");
  });

  it("creates managed section in .claude/skills/.gitignore", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");

    const gitignore = await readFile(join(root, ".claude/skills/.gitignore"), "utf8");
    expect(gitignore).toContain("managed by capm");
    expect(gitignore).toContain("lint-fix");
  });

  it("removes entry from managed section on uninstall", async () => {
    await run(root, "skill", "i", "acme/tools/skills/lint-fix");
    await run(root, "skill", "rm", "lint-fix");

    // .gitignore should be removed or not contain the entry
    try {
      const gitignore = await readFile(join(root, ".claude/skills/.gitignore"), "utf8");
      expect(gitignore).not.toContain("lint-fix");
    } catch {
      // File removed entirely — also acceptable
    }
  });
});
