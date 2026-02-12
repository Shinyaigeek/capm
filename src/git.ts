import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CloneResult {
  tmpDir: string;
  commit: string;
}

/**
 * Build HTTPS clone URL from org/repo.
 */
function cloneUrl(org: string, repo: string): string {
  return `https://github.com/${org}/${repo}.git`;
}

/**
 * Shallow-clone a repo at a specific ref into a temp directory.
 * Returns { tmpDir, commit }.
 */
export async function shallowClone(org: string, repo: string, ref = "main"): Promise<CloneResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "sibyl-clone-"));
  const url = cloneUrl(org, repo);

  await execFileAsync(
    "git",
    ["clone", "--depth", "1", "--single-branch", "--branch", ref, url, tmpDir],
    { timeout: 60_000 },
  );

  const commit = await resolveCommit(tmpDir);
  return { tmpDir, commit };
}

/**
 * Clone a repo at a specific commit SHA (for restore from lockfile).
 * Uses fetch + checkout since shallow clone by commit is not directly supported.
 */
export async function cloneAtCommit(
  org: string,
  repo: string,
  commit: string,
): Promise<CloneResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "sibyl-clone-"));
  const url = cloneUrl(org, repo);

  await execFileAsync("git", ["init", tmpDir], { timeout: 10_000 });
  await execFileAsync("git", ["-C", tmpDir, "remote", "add", "origin", url], {
    timeout: 10_000,
  });
  await execFileAsync("git", ["-C", tmpDir, "fetch", "--depth", "1", "origin", commit], {
    timeout: 60_000,
  });
  await execFileAsync("git", ["-C", tmpDir, "checkout", "FETCH_HEAD"], {
    timeout: 10_000,
  });

  return { tmpDir, commit };
}

/**
 * Get the HEAD commit SHA of a cloned repo.
 */
async function resolveCommit(repoDir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
    timeout: 10_000,
  });
  return stdout.trim();
}
