import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addEntry, findEntries, readLock, removeEntry, writeLock } from "../lockfile.js";
import type { LockEntry, Lockfile } from "../lockfile.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "capm-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const entry: LockEntry = {
  type: "skill",
  org: "acme",
  repo: "tools",
  path: "skills/lint-fix",
  ref: "main",
  commit: "abc12345deadbeef",
  name: "lint-fix",
};

describe("readLock", () => {
  it("returns empty packages when lockfile does not exist", async () => {
    const lock = await readLock(root);
    expect(lock).toEqual({ packages: {} });
  });

  it("reads existing lockfile", async () => {
    const data: Lockfile = { packages: { "acme/tools/skills/lint-fix": entry } };
    await writeLock(root, data);
    const lock = await readLock(root);
    expect(lock).toEqual(data);
  });
});

describe("writeLock", () => {
  it("writes lockfile with pretty JSON", async () => {
    const data: Lockfile = { packages: { "x/y/z": entry } };
    await writeLock(root, data);
    const raw = await readFile(join(root, "capm-lock.json"), "utf8");
    expect(raw).toBe(`${JSON.stringify(data, null, 2)}\n`);
  });

  it("overwrites existing lockfile", async () => {
    await writeLock(root, { packages: { a: entry } });
    await writeLock(root, { packages: { b: entry } });
    const lock = await readLock(root);
    expect(lock.packages).toHaveProperty("b");
    expect(lock.packages).not.toHaveProperty("a");
  });
});

describe("addEntry", () => {
  it("adds a new entry", async () => {
    const lock = await addEntry(root, { key: "acme/tools/skills/lint-fix", ...entry });
    expect(lock.packages["acme/tools/skills/lint-fix"]).toEqual(entry);
  });

  it("overwrites existing entry with same key", async () => {
    await addEntry(root, { key: "k", ...entry });
    const updated = { ...entry, commit: "newcommit1234" };
    const lock = await addEntry(root, { key: "k", ...updated });
    expect(lock.packages.k.commit).toBe("newcommit1234");
  });

  it("preserves other entries", async () => {
    await addEntry(root, { key: "a", ...entry, name: "a" });
    await addEntry(root, { key: "b", ...entry, name: "b" });
    const lock = await readLock(root);
    expect(Object.keys(lock.packages)).toEqual(["a", "b"]);
  });
});

describe("removeEntry", () => {
  it("removes an entry by key", async () => {
    await addEntry(root, { key: "k", ...entry });
    const lock = await removeEntry(root, "k");
    expect(lock.packages).not.toHaveProperty("k");
  });

  it("does nothing for non-existent key", async () => {
    await addEntry(root, { key: "k", ...entry });
    const lock = await removeEntry(root, "nonexistent");
    expect(lock.packages).toHaveProperty("k");
  });
});

describe("findEntries", () => {
  const lock: Lockfile = {
    packages: {
      "a/b/skills/x": { ...entry, type: "skill", name: "x" },
      "a/b/agents/y": { ...entry, type: "agent", name: "y" },
      "a/b/skills/z": { ...entry, type: "skill", name: "z" },
    },
  };

  it("returns all entries with no filter", () => {
    const result = findEntries(lock);
    expect(result).toHaveLength(3);
  });

  it("filters by type", () => {
    const result = findEntries(lock, { type: "skill" });
    expect(result).toHaveLength(2);
    expect(result.every(([, e]) => e.type === "skill")).toBe(true);
  });

  it("filters by name", () => {
    const result = findEntries(lock, { name: "y" });
    expect(result).toHaveLength(1);
    expect(result[0][1].name).toBe("y");
  });

  it("filters by type and name", () => {
    const result = findEntries(lock, { type: "skill", name: "x" });
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("a/b/skills/x");
  });

  it("returns empty for no match", () => {
    const result = findEntries(lock, { type: "command" });
    expect(result).toHaveLength(0);
  });
});
