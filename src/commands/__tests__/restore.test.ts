import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeLock } from "../../lockfile.js";
import type { Lockfile } from "../../lockfile.js";
import { storePath } from "../../store.js";

let mockSrcDir: string;

vi.mock("../../git.js", () => ({
  cloneAtCommit: vi.fn(async () => {
    return { tmpDir: mockSrcDir, commit: "aabbccdd11223344" };
  }),
  shallowClone: vi.fn(async () => {
    return { tmpDir: mockSrcDir, commit: "aabbccdd11223344" };
  }),
}));

const { restore } = await import("../restore.js");
const gitMock = await import("../../git.js");

let root: string;

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
  mockSrcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(mockSrcDir, { recursive: true, force: true }).catch(() => {});
});

describe("restore", () => {
  it("prints message when lockfile is empty", async () => {
    const spy = vi.spyOn(console, "log");
    await restore(root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No packages in lockfile.");
    spy.mockRestore();
  });

  it("restores packages from lockfile", async () => {
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

    // Create fake source content matching the path
    await mkdir(join(mockSrcDir, "skills/lint-fix"), { recursive: true });
    await writeFile(join(mockSrcDir, "skills/lint-fix/prompt.md"), "# Lint Fix");

    await restore(root);

    // Symlink should exist
    const linkStat = await lstat(join(root, ".claude/skills/lint-fix"));
    expect(linkStat.isSymbolicLink()).toBe(true);
  });

  it("skips clone when store already has the content", async () => {
    const loc = {
      org: "acme",
      repo: "tools",
      commit: "aabbccdd11223344",
      path: "skills/lint-fix",
    };

    // Pre-populate the store
    const dest = storePath(root, loc);
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "prompt.md"), "# Pre-existing");

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

    await restore(root);

    // Should not have called clone since store already has it
    expect(gitMock.cloneAtCommit).not.toHaveBeenCalled();
    expect(gitMock.shallowClone).not.toHaveBeenCalled();

    // Symlink should still be created
    const linkStat = await lstat(join(root, ".claude/skills/lint-fix"));
    expect(linkStat.isSymbolicLink()).toBe(true);
  });
});
