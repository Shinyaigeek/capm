export interface Spec {
  org: string;
  repo: string;
  path: string;
  ref: string;
}

/**
 * Parse a spec string like "org/repo/path@ref" into components.
 *
 * Format: <org>/<repo>/<path>[@<ref>]
 *   - org:  GitHub org or user
 *   - repo: repository name
 *   - path: sub-path within the repo (can contain /)
 *   - ref:  optional branch/tag/commit (defaults to "main")
 */
export function parseSpec(raw: string): Spec {
  if (!raw || typeof raw !== "string") {
    throw new Error(`Invalid spec: "${raw}"`);
  }

  let body = raw;
  let ref = "main";
  const atIdx = raw.lastIndexOf("@");
  if (atIdx > 0) {
    ref = raw.slice(atIdx + 1);
    body = raw.slice(0, atIdx);
    if (!ref) ref = "main";
  }

  const parts = body.split("/");
  if (parts.length < 3) {
    throw new Error(
      `Invalid spec "${raw}": expected <org>/<repo>/<path> (at least 3 segments)`,
    );
  }

  const org = parts[0];
  const repo = parts[1];
  const path = parts.slice(2).join("/");

  if (!org || !repo || !path) {
    throw new Error(`Invalid spec "${raw}": org, repo, and path are required`);
  }

  return { org, repo, path, ref };
}

/**
 * Derive a short name from the last segment of the path.
 *   "acme/tools/skills/lint-fix" → "lint-fix"
 *   "acme/tools/agents/my-agent.md" → "my-agent"
 */
export function nameFromSpec(spec: Spec): string {
  const last = spec.path.split("/").pop()!;
  return last.replace(/\.md$/, "");
}

/**
 * Build the spec key used in the lockfile.
 *   { org: "acme", repo: "tools", path: "skills/lint-fix" } → "acme/tools/skills/lint-fix"
 */
export function specKey(spec: Spec): string {
  return `${spec.org}/${spec.repo}/${spec.path}`;
}
