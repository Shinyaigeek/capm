import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeLock } from "../../lockfile.js";
import type { Lockfile } from "../../lockfile.js";

let mockSrcDir: string;
let mockCommit: string;

vi.mock("../../git.js", () => ({
  shallowClone: vi.fn(async () => {
    return { tmpDir: mockSrcDir, commit: mockCommit };
  }),
}));

const { update } = await import("../update.js");
const gitMock = await import("../../git.js");

let root: string;

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
  mockSrcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
  mockCommit = "newcommit1122334455";
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(mockSrcDir, { recursive: true, force: true }).catch(() => {});
});

describe("update", () => {
  it("prints message when lockfile is empty", async () => {
    const spy = vi.spyOn(console, "log");
    await update(undefined, undefined, root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No packages in lockfile.");
    spy.mockRestore();
  });

  it("prints message when no matching packages found", async () => {
    const lock: Lockfile = {
      packages: {
        "acme/tools/skills/lint-fix": {
          type: "skill",
          org: "acme",
          repo: "tools",
          path: "skills/lint-fix",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "lint-fix",
        },
      },
    };
    await writeLock(root, lock);

    const spy = vi.spyOn(console, "log");
    await update("agent", undefined, root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No matching packages");
    spy.mockRestore();
  });

  it("reports up to date when commit unchanged", async () => {
    mockCommit = "aabbccdd11223344";

    const lock: Lockfile = {
      packages: {
        "acme/tools/skills/lint-fix": {
          type: "skill",
          org: "acme",
          repo: "tools",
          path: "skills/lint-fix",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "lint-fix",
        },
      },
    };
    await writeLock(root, lock);

    await mkdir(join(mockSrcDir, "skills/lint-fix"), { recursive: true });
    await writeFile(join(mockSrcDir, "skills/lint-fix/prompt.md"), "# Lint Fix");

    const spy = vi.spyOn(console, "log");
    await update(undefined, undefined, root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("already up to date");
    expect(output).toContain("Everything is up to date");
    spy.mockRestore();
  });

  it("updates package when new commit is available", async () => {
    mockCommit = "newcommit1122334455";

    const lock: Lockfile = {
      packages: {
        "acme/tools/skills/lint-fix": {
          type: "skill",
          org: "acme",
          repo: "tools",
          path: "skills/lint-fix",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "lint-fix",
        },
      },
    };
    await writeLock(root, lock);

    await mkdir(join(mockSrcDir, "skills/lint-fix"), { recursive: true });
    await writeFile(join(mockSrcDir, "skills/lint-fix/prompt.md"), "# Updated");

    await update(undefined, undefined, root);

    // Symlink should exist
    const linkStat = await lstat(join(root, ".claude/skills/lint-fix"));
    expect(linkStat.isSymbolicLink()).toBe(true);

    // Lockfile should have new commit
    const { readLock } = await import("../../lockfile.js");
    const updated = await readLock(root);
    expect(updated.packages["acme/tools/skills/lint-fix"].commit).toBe("newcommit1122334455");
  });

  it("filters by org/repo", async () => {
    mockCommit = "newcommit1122334455";

    const lock: Lockfile = {
      packages: {
        "acme/tools/skills/lint-fix": {
          type: "skill",
          org: "acme",
          repo: "tools",
          path: "skills/lint-fix",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "lint-fix",
        },
        "other/repo/skills/fmt": {
          type: "skill",
          org: "other",
          repo: "repo",
          path: "skills/fmt",
          ref: "main",
          commit: "oldoldoldold1234",
          name: "fmt",
        },
      },
    };
    await writeLock(root, lock);

    await mkdir(join(mockSrcDir, "skills/lint-fix"), { recursive: true });
    await writeFile(join(mockSrcDir, "skills/lint-fix/prompt.md"), "# Updated");

    await update(undefined, "acme/tools", root);

    // Only acme/tools should have been cloned
    expect(gitMock.shallowClone).toHaveBeenCalledTimes(1);
    expect(gitMock.shallowClone).toHaveBeenCalledWith("acme", "tools", "main");
  });

  it("filters by type", async () => {
    mockCommit = "aabbccdd11223344";

    const lock: Lockfile = {
      packages: {
        "acme/tools/skills/lint-fix": {
          type: "skill",
          org: "acme",
          repo: "tools",
          path: "skills/lint-fix",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "lint-fix",
        },
        "acme/tools/agents/helper.md": {
          type: "agent",
          org: "acme",
          repo: "tools",
          path: "agents/helper.md",
          ref: "main",
          commit: "aabbccdd11223344",
          name: "helper",
        },
      },
    };
    await writeLock(root, lock);

    await mkdir(join(mockSrcDir, "skills/lint-fix"), { recursive: true });
    await writeFile(join(mockSrcDir, "skills/lint-fix/prompt.md"), "# Lint Fix");

    const spy = vi.spyOn(console, "log");
    await update("skill", undefined, root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    // Should only check 1 package (the skill), not the agent
    expect(output).toContain("1");
    expect(output).toContain("skill");
    spy.mockRestore();
  });
});
