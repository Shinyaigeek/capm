import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeLock } from "../../lockfile.js";
import type { Lockfile } from "../../lockfile.js";
import { list } from "../list.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sibyl-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const baseLock: Lockfile = {
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
    "acme/tools/agents/reviewer": {
      type: "agent",
      org: "acme",
      repo: "tools",
      path: "agents/reviewer",
      ref: "main",
      commit: "aabbccdd11223344",
      name: "reviewer",
    },
  },
};

describe("list", () => {
  it("prints message when no packages installed", async () => {
    const spy = vi.spyOn(console, "log");
    await list(undefined, root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No packages installed.");
    spy.mockRestore();
  });

  it("prints message when no packages of given type installed", async () => {
    await writeLock(root, baseLock);
    const spy = vi.spyOn(console, "log");
    await list("command", root);
    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No commands installed.");
    spy.mockRestore();
  });

  it("lists all packages", async () => {
    await writeLock(root, baseLock);
    const spy = vi.spyOn(console, "log");
    await list(undefined, root);

    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("lint-fix");
    expect(output).toContain("skill");
    expect(output).toContain("reviewer");
    expect(output).toContain("agent");
    spy.mockRestore();
  });

  it("lists packages filtered by type", async () => {
    await writeLock(root, baseLock);
    const spy = vi.spyOn(console, "log");
    await list("skill", root);

    const output = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("lint-fix");
    expect(output).toContain("skill");
    expect(output).not.toContain("reviewer");
    spy.mockRestore();
  });
});
