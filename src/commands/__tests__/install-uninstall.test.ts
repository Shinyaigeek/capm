import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock git.ts to avoid network calls
vi.mock("../../git.js", () => {
  let mockSrcDir: string | undefined;

  return {
    setMockSrcDir: (dir: string) => {
      mockSrcDir = dir;
    },
    shallowClone: vi.fn(async () => {
      if (!mockSrcDir) throw new Error("mockSrcDir not set");
      return { tmpDir: mockSrcDir, commit: "aabbccdd11223344" };
    }),
    cloneAtCommit: vi.fn(async () => {
      if (!mockSrcDir) throw new Error("mockSrcDir not set");
      return { tmpDir: mockSrcDir, commit: "aabbccdd11223344" };
    }),
  };
});

// Import after mock setup
const { install } = await import("../install.js");
const { uninstall } = await import("../uninstall.js");
// biome-ignore lint/suspicious/noExplicitAny: mock module augmentation
const { setMockSrcDir } = (await import("../../git.js")) as any;

let root: string;
let srcDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
  srcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));

  // Create fake repo content
  await mkdir(join(srcDir, "skills/lint-fix"), { recursive: true });
  await writeFile(join(srcDir, "skills/lint-fix/prompt.md"), "# Lint Fix Skill");

  await mkdir(join(srcDir, "agents/reviewer"), { recursive: true });
  await writeFile(join(srcDir, "agents/reviewer/reviewer.md"), "# Reviewer Agent");

  await mkdir(join(srcDir, "commands/deploy"), { recursive: true });
  await writeFile(join(srcDir, "commands/deploy/deploy.md"), "# Deploy Command");

  setMockSrcDir(srcDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  // Don't remove srcDir — install's finally block handles that,
  // but since it's mocked, we clean up ourselves
  await rm(srcDir, { recursive: true, force: true }).catch(() => {});
});

describe("install", () => {
  it("installs a skill and creates lockfile + symlink", async () => {
    await install("skill", "acme/tools/skills/lint-fix", root);

    // Check lockfile
    const lock = JSON.parse(await readFile(join(root, "sibyl-lock.json"), "utf8"));
    const entry = lock.packages["acme/tools/skills/lint-fix"];
    expect(entry).toBeDefined();
    expect(entry.type).toBe("skill");
    expect(entry.name).toBe("lint-fix");
    expect(entry.commit).toBe("aabbccdd11223344");

    // Check symlink exists
    const linkStat = await lstat(join(root, ".claude/skills/lint-fix"));
    expect(linkStat.isSymbolicLink()).toBe(true);
  });

  it("installs an agent and symlinks md files", async () => {
    await install("agent", "acme/tools/agents/reviewer", root);

    const lock = JSON.parse(await readFile(join(root, "sibyl-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/agents/reviewer"].type).toBe("agent");

    const content = await readFile(join(root, ".claude/agents/reviewer.md"), "utf8");
    expect(content).toBe("# Reviewer Agent");
  });

  it("installs a command and symlinks md files", async () => {
    await install("command", "acme/tools/commands/deploy", root);

    const lock = JSON.parse(await readFile(join(root, "sibyl-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/commands/deploy"].type).toBe("command");

    const content = await readFile(join(root, ".claude/commands/deploy.md"), "utf8");
    expect(content).toBe("# Deploy Command");
  });

  it("creates .gitignore with .sibyl/ entry", async () => {
    await install("skill", "acme/tools/skills/lint-fix", root);

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain(".sibyl/");
  });
});

describe("uninstall", () => {
  it("removes a skill: symlink, store, and lockfile entry", async () => {
    await install("skill", "acme/tools/skills/lint-fix", root);

    // Verify installed
    expect((await lstat(join(root, ".claude/skills/lint-fix"))).isSymbolicLink()).toBe(true);

    await uninstall("skill", "lint-fix", root);

    // Symlink removed
    await expect(lstat(join(root, ".claude/skills/lint-fix"))).rejects.toThrow();

    // Lockfile entry removed
    const lock = JSON.parse(await readFile(join(root, "sibyl-lock.json"), "utf8"));
    expect(lock.packages["acme/tools/skills/lint-fix"]).toBeUndefined();
  });

  it("logs message for non-existent package", async () => {
    const spy = vi.spyOn(console, "log");
    await uninstall("skill", "nonexistent", root);
    expect(spy).toHaveBeenCalledWith('No skill named "nonexistent" found.');
    spy.mockRestore();
  });
});
