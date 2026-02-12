import { describe, expect, it } from "vitest";
import { nameFromSpec, parseSpec, specKey } from "../spec.js";

describe("parseSpec", () => {
  it("parses org/repo/path with default ref", () => {
    const spec = parseSpec("acme/tools/skills/lint-fix");
    expect(spec).toEqual({
      org: "acme",
      repo: "tools",
      path: "skills/lint-fix",
      ref: "main",
    });
  });

  it("parses org/repo/path@ref", () => {
    const spec = parseSpec("acme/tools/skills/lint-fix@v2");
    expect(spec).toEqual({
      org: "acme",
      repo: "tools",
      path: "skills/lint-fix",
      ref: "v2",
    });
  });

  it("handles deep paths", () => {
    const spec = parseSpec("org/repo/a/b/c/d");
    expect(spec).toEqual({
      org: "org",
      repo: "repo",
      path: "a/b/c/d",
      ref: "main",
    });
  });

  it("handles deep paths with ref", () => {
    const spec = parseSpec("org/repo/a/b/c@develop");
    expect(spec).toEqual({
      org: "org",
      repo: "repo",
      path: "a/b/c",
      ref: "develop",
    });
  });

  it("throws on empty string", () => {
    expect(() => parseSpec("")).toThrow("Invalid spec");
  });

  it("throws on too few segments", () => {
    expect(() => parseSpec("org/repo")).toThrow("at least 3 segments");
  });

  it("throws on single segment", () => {
    expect(() => parseSpec("just-one")).toThrow("at least 3 segments");
  });

  it("uses last @ for ref when path contains @", () => {
    const spec = parseSpec("org/repo/path@feature@v1");
    expect(spec).toEqual({
      org: "org",
      repo: "repo",
      path: "path@feature",
      ref: "v1",
    });
  });
});

describe("nameFromSpec", () => {
  it("extracts the last path segment", () => {
    const spec = { org: "acme", repo: "tools", path: "skills/lint-fix", ref: "main" };
    expect(nameFromSpec(spec)).toBe("lint-fix");
  });

  it("strips .md extension", () => {
    const spec = { org: "acme", repo: "tools", path: "agents/my-agent.md", ref: "main" };
    expect(nameFromSpec(spec)).toBe("my-agent");
  });

  it("handles single-segment path", () => {
    const spec = { org: "acme", repo: "tools", path: "deploy", ref: "main" };
    expect(nameFromSpec(spec)).toBe("deploy");
  });
});

describe("specKey", () => {
  it("builds the key string", () => {
    const spec = { org: "acme", repo: "tools", path: "skills/lint-fix", ref: "main" };
    expect(specKey(spec)).toBe("acme/tools/skills/lint-fix");
  });
});
