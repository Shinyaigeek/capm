import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { link, unlinkPackage } from "../linker.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("link — skill (directory)", () => {
  it("creates a relative symlink for a skill directory", async () => {
    // Create a fake store path with contents
    const storeDir = join(root, ".sibyl/store/acme/tools/abc123/skills/lint-fix");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "prompt.md"), "# Lint Fix");

    await link(root, "skill", "lint-fix", storeDir);

    const linkPath = join(root, ".claude/skills/lint-fix");
    const linkTarget = await readlink(linkPath);

    // Symlink should be relative
    expect(linkTarget).not.toMatch(/^\//);
    expect(linkTarget).toBe(relative(join(root, ".claude/skills"), storeDir));

    // Should be able to read through the symlink
    const content = await readFile(join(linkPath, "prompt.md"), "utf8");
    expect(content).toBe("# Lint Fix");
  });

  it("replaces existing symlink", async () => {
    const store1 = join(root, ".sibyl/store/acme/tools/aaa/skills/s");
    const store2 = join(root, ".sibyl/store/acme/tools/bbb/skills/s");
    await mkdir(store1, { recursive: true });
    await mkdir(store2, { recursive: true });
    await writeFile(join(store1, "f.md"), "v1");
    await writeFile(join(store2, "f.md"), "v2");

    await link(root, "skill", "s", store1);
    await link(root, "skill", "s", store2);

    const content = await readFile(join(root, ".claude/skills/s/f.md"), "utf8");
    expect(content).toBe("v2");
  });
});

describe("link — agent (md files)", () => {
  it("creates symlinks for .md files in a directory", async () => {
    const storeDir = join(root, ".sibyl/store/acme/tools/abc123/agents/review");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "review.md"), "# Review Agent");
    await writeFile(join(storeDir, "helper.md"), "# Helper");

    await link(root, "agent", "review", storeDir);

    const agentsDir = join(root, ".claude/agents");
    const review = await readFile(join(agentsDir, "review.md"), "utf8");
    const helper = await readFile(join(agentsDir, "helper.md"), "utf8");
    expect(review).toBe("# Review Agent");
    expect(helper).toBe("# Helper");
  });

  it("creates a single symlink with .md suffix when no md files found", async () => {
    // Store path is a file itself (e.g., path pointed to a .md file)
    const storeFile = join(root, ".sibyl/store/acme/tools/abc123/agents/my-agent.md");
    await mkdir(join(root, ".sibyl/store/acme/tools/abc123/agents"), { recursive: true });
    await writeFile(storeFile, "# My Agent");

    await link(root, "agent", "my-agent", storeFile);

    const linkPath = join(root, ".claude/agents/my-agent.md");
    const content = await readFile(linkPath, "utf8");
    expect(content).toBe("# My Agent");
  });
});

describe("link — command", () => {
  it("creates symlinks for .md files in command directory", async () => {
    const storeDir = join(root, ".sibyl/store/acme/tools/abc123/commands/deploy");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "deploy.md"), "# Deploy");

    await link(root, "command", "deploy", storeDir);

    const content = await readFile(join(root, ".claude/commands/deploy.md"), "utf8");
    expect(content).toBe("# Deploy");
  });
});

describe("unlinkPackage", () => {
  it("removes a skill symlink", async () => {
    const storeDir = join(root, ".sibyl/store/acme/tools/abc123/skills/lint-fix");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "prompt.md"), "content");

    await link(root, "skill", "lint-fix", storeDir);

    const linkPath = join(root, ".claude/skills/lint-fix");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);

    await unlinkPackage(root, "skill", "lint-fix", storeDir);

    await expect(lstat(linkPath)).rejects.toThrow();
  });

  it("removes agent md symlinks", async () => {
    const storeDir = join(root, ".sibyl/store/acme/tools/abc123/agents/review");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "review.md"), "content");

    await link(root, "agent", "review", storeDir);
    await unlinkPackage(root, "agent", "review", storeDir);

    await expect(lstat(join(root, ".claude/agents/review.md"))).rejects.toThrow();
  });

  it("does not throw when symlink does not exist", async () => {
    await expect(unlinkPackage(root, "skill", "nonexistent", "/fake/path")).resolves.not.toThrow();
  });
});
