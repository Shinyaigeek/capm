import {
  symlink,
  unlink,
  mkdir,
  readdir,
  stat,
  lstat,
} from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import type { PackageType } from "./lockfile.js";

const TYPE_DIRS: Record<PackageType, string> = {
  skill: "skills",
  agent: "agents",
  command: "commands",
};

/**
 * Get the .claude/<type>s directory.
 */
function claudeDir(root: string, type: PackageType): string {
  return join(root, ".claude", TYPE_DIRS[type]);
}

/**
 * Create symlink(s) for a package.
 *
 * - skill: symlink the entire directory
 * - agent/command: find .md files inside and symlink each
 *
 * All symlinks use relative paths.
 */
export async function link(
  root: string,
  type: PackageType,
  name: string,
  storePathAbs: string,
): Promise<void> {
  const targetDir = claudeDir(root, type);
  await mkdir(targetDir, { recursive: true });

  if (type === "skill") {
    const linkPath = join(targetDir, name);
    await forceSymlink(storePathAbs, linkPath);
  } else {
    const mdFiles = await findMdFiles(storePathAbs);
    if (mdFiles.length === 0) {
      // The store path itself may be a single .md file
      const linkPath = join(targetDir, name + ".md");
      await forceSymlink(storePathAbs, linkPath);
    } else {
      for (const mdFile of mdFiles) {
        const linkPath = join(targetDir, mdFile);
        const srcPath = join(storePathAbs, mdFile);
        await forceSymlink(srcPath, linkPath);
      }
    }
  }
}

/**
 * Remove symlink(s) for a package.
 */
export async function unlinkPackage(
  root: string,
  type: PackageType,
  name: string,
  storePathAbs: string,
): Promise<void> {
  const targetDir = claudeDir(root, type);

  if (type === "skill") {
    await safeUnlink(join(targetDir, name));
  } else {
    let mdFiles: string[] = [];
    try {
      mdFiles = await findMdFiles(storePathAbs);
    } catch {
      // store path may already be removed
    }
    if (mdFiles.length === 0) {
      await safeUnlink(join(targetDir, name + ".md"));
    } else {
      for (const mdFile of mdFiles) {
        await safeUnlink(join(targetDir, mdFile));
      }
    }
  }
}

/**
 * Find .md files in a directory (non-recursive).
 */
async function findMdFiles(dir: string): Promise<string[]> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return [];
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith(".md"));
  } catch {
    return [];
  }
}

/**
 * Create a relative symlink, removing any existing one.
 */
async function forceSymlink(target: string, linkPath: string): Promise<void> {
  const linkDir = dirname(linkPath);
  const rel = relative(linkDir, target);
  await safeUnlink(linkPath);
  await symlink(rel, linkPath);
}

/**
 * Remove a symlink if it exists.
 */
async function safeUnlink(p: string): Promise<void> {
  try {
    await lstat(p);
    await unlink(p);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
