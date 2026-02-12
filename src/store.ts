import { cp, mkdir, readFile, appendFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const SIBYL_DIR = ".sibyl";
const STORE_DIR = "store";

export interface StoreLocation {
  org: string;
  repo: string;
  commit: string;
  path: string;
}

/**
 * Get the store root: <projectRoot>/.sibyl/store
 */
export function storeRoot(root: string): string {
  return join(root, SIBYL_DIR, STORE_DIR);
}

/**
 * Build the store path for a specific package version:
 *   .sibyl/store/<org>/<repo>/<commit>/<path>
 */
export function storePath(root: string, loc: StoreLocation): string {
  return join(storeRoot(root), loc.org, loc.repo, loc.commit, loc.path);
}

/**
 * Copy files from a cloned repo into the store.
 * Returns the destination store path.
 */
export async function placeInStore(
  root: string,
  loc: StoreLocation,
  srcDir: string,
): Promise<string> {
  const dest = storePath(root, loc);
  const src = join(srcDir, loc.path);

  await mkdir(dest, { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });

  await ensureGitignore(root);
  return dest;
}

/**
 * Remove a package from the store.
 */
export async function removeFromStore(
  root: string,
  loc: StoreLocation,
): Promise<void> {
  const dest = storePath(root, loc);
  await rm(dest, { recursive: true, force: true });
}

/**
 * Check if a store path exists.
 */
export async function existsInStore(
  root: string,
  loc: StoreLocation,
): Promise<boolean> {
  try {
    await stat(storePath(root, loc));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure .sibyl/ is in .gitignore.
 */
async function ensureGitignore(root: string): Promise<void> {
  const gitignorePath = join(root, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const lines = content.split("\n");
  if (
    lines.some((line) => line.trim() === ".sibyl/" || line.trim() === ".sibyl")
  ) {
    return;
  }

  const entry =
    content.length > 0 && !content.endsWith("\n")
      ? "\n.sibyl/\n"
      : ".sibyl/\n";
  await appendFile(gitignorePath, entry);
}
