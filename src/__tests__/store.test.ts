import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsInStore, placeInStore, removeFromStore, storePath, storeRoot } from "../store.js";
import type { StoreLocation } from "../store.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const loc: StoreLocation = {
  org: "acme",
  repo: "tools",
  commit: "abc12345",
  path: "skills/lint-fix",
};

describe("storeRoot", () => {
  it("returns .sibyl/store under root", () => {
    expect(storeRoot("/project")).toBe("/project/.sibyl/store");
  });
});

describe("storePath", () => {
  it("builds full store path", () => {
    expect(storePath("/project", loc)).toBe(
      "/project/.sibyl/store/acme/tools/abc12345/skills/lint-fix",
    );
  });
});

describe("placeInStore", () => {
  it("copies files from source into the store", async () => {
    // Create a fake source directory simulating a cloned repo
    const srcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
    const srcPath = join(srcDir, "skills/lint-fix");
    await mkdir(srcPath, { recursive: true });
    await writeFile(join(srcPath, "prompt.md"), "# Lint Fix\n");

    const dest = await placeInStore(root, loc, srcDir);

    // Verify file was copied
    const content = await readFile(join(dest, "prompt.md"), "utf8");
    expect(content).toBe("# Lint Fix\n");

    await rm(srcDir, { recursive: true, force: true });
  });

  it("creates .gitignore with .sibyl/ entry", async () => {
    const srcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
    const srcPath = join(srcDir, "skills/lint-fix");
    await mkdir(srcPath, { recursive: true });
    await writeFile(join(srcPath, "file.txt"), "content");

    await placeInStore(root, loc, srcDir);

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain(".sibyl/");

    await rm(srcDir, { recursive: true, force: true });
  });

  it("does not duplicate .sibyl/ in .gitignore", async () => {
    // Pre-create .gitignore with .sibyl/
    await writeFile(join(root, ".gitignore"), "node_modules\n.sibyl/\n");

    const srcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
    const srcPath = join(srcDir, "skills/lint-fix");
    await mkdir(srcPath, { recursive: true });
    await writeFile(join(srcPath, "file.txt"), "content");

    await placeInStore(root, loc, srcDir);

    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    const count = gitignore.split(".sibyl/").length - 1;
    expect(count).toBe(1);

    await rm(srcDir, { recursive: true, force: true });
  });
});

describe("removeFromStore", () => {
  it("removes a stored package", async () => {
    // Place something first
    const srcDir = await mkdtemp(join(tmpdir(), "sibyl-src-"));
    const srcPath = join(srcDir, "skills/lint-fix");
    await mkdir(srcPath, { recursive: true });
    await writeFile(join(srcPath, "file.txt"), "content");
    await placeInStore(root, loc, srcDir);

    expect(await existsInStore(root, loc)).toBe(true);
    await removeFromStore(root, loc);
    expect(await existsInStore(root, loc)).toBe(false);

    await rm(srcDir, { recursive: true, force: true });
  });

  it("does not throw if path does not exist", async () => {
    await expect(removeFromStore(root, loc)).resolves.not.toThrow();
  });
});

describe("existsInStore", () => {
  it("returns false when not in store", async () => {
    expect(await existsInStore(root, loc)).toBe(false);
  });

  it("returns true when in store", async () => {
    const dest = storePath(root, loc);
    await mkdir(dest, { recursive: true });
    expect(await existsInStore(root, loc)).toBe(true);
  });
});
