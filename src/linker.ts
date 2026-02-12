import {
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
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

  const linkNames: string[] = [];

  if (type === "skill") {
    const linkPath = join(targetDir, name);
    await forceSymlink(storePathAbs, linkPath);
    linkNames.push(name);
  } else {
    const mdFiles = await findMdFiles(storePathAbs);
    if (mdFiles.length === 0) {
      // The store path itself may be a single .md file
      const linkPath = join(targetDir, `${name}.md`);
      await forceSymlink(storePathAbs, linkPath);
      linkNames.push(`${name}.md`);
    } else {
      for (const mdFile of mdFiles) {
        const linkPath = join(targetDir, mdFile);
        const srcPath = join(storePathAbs, mdFile);
        await forceSymlink(srcPath, linkPath);
        linkNames.push(mdFile);
      }
    }
  }

  await addToGitignore(targetDir, linkNames);
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

  const removeNames: string[] = [];

  if (type === "skill") {
    await safeUnlink(join(targetDir, name));
    removeNames.push(name);
  } else {
    let mdFiles: string[] = [];
    try {
      mdFiles = await findMdFiles(storePathAbs);
    } catch {
      // store path may already be removed
    }
    if (mdFiles.length === 0) {
      await safeUnlink(join(targetDir, `${name}.md`));
      removeNames.push(`${name}.md`);
    } else {
      for (const mdFile of mdFiles) {
        await safeUnlink(join(targetDir, mdFile));
        removeNames.push(mdFile);
      }
    }
  }

  await removeFromGitignore(targetDir, removeNames);
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

const GITIGNORE_HEADER = "# managed by sibyl";

/**
 * Read the sibyl-managed section from a .gitignore in the given directory.
 * Returns the full content and the set of managed entries.
 */
async function readGitignoreEntries(
  dir: string,
): Promise<{ content: string; managed: Set<string> }> {
  const gitignorePath = join(dir, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const managed = new Set<string>();
  let inSection = false;
  for (const line of content.split("\n")) {
    if (line.trim() === GITIGNORE_HEADER) {
      inSection = true;
      continue;
    }
    if (inSection) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        inSection = false;
        continue;
      }
      managed.add(trimmed);
    }
  }
  return { content, managed };
}

/**
 * Write the .gitignore file, replacing the sibyl-managed section.
 * If there are no managed entries, remove the section entirely.
 */
async function writeGitignore(
  dir: string,
  fullContent: string,
  managed: Set<string>,
): Promise<void> {
  // Strip existing sibyl section from content
  const lines = fullContent.split("\n");
  const cleaned: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.trim() === GITIGNORE_HEADER) {
      inSection = true;
      continue;
    }
    if (inSection) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        inSection = false;
        // keep blank lines / comments that aren't part of our section
        cleaned.push(line);
        continue;
      }
      // skip managed entry lines
      continue;
    }
    cleaned.push(line);
  }

  // Remove trailing empty lines from cleaned
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === "") {
    cleaned.pop();
  }

  if (managed.size === 0) {
    // No managed entries — write cleaned content or remove file
    if (cleaned.length === 0 || (cleaned.length === 1 && cleaned[0] === "")) {
      // gitignore would be empty; remove it
      await safeUnlink(join(dir, ".gitignore"));
      return;
    }
    await writeFile(join(dir, ".gitignore"), `${cleaned.join("\n")}\n`);
    return;
  }

  const sorted = [...managed].sort();
  const section = `${GITIGNORE_HEADER}\n${sorted.join("\n")}`;

  const prefix = cleaned.length > 0 ? `${cleaned.join("\n")}\n\n` : "";
  await writeFile(join(dir, ".gitignore"), `${prefix}${section}\n`);
}

/**
 * Add entries to the sibyl-managed .gitignore in the given directory.
 */
async function addToGitignore(dir: string, names: string[]): Promise<void> {
  const { content, managed } = await readGitignoreEntries(dir);
  let changed = false;
  for (const name of names) {
    if (!managed.has(name)) {
      managed.add(name);
      changed = true;
    }
  }
  if (changed) {
    await writeGitignore(dir, content, managed);
  }
}

/**
 * Remove entries from the sibyl-managed .gitignore in the given directory.
 */
async function removeFromGitignore(dir: string, names: string[]): Promise<void> {
  const { content, managed } = await readGitignoreEntries(dir);
  let changed = false;
  for (const name of names) {
    if (managed.delete(name)) {
      changed = true;
    }
  }
  if (changed) {
    await writeGitignore(dir, content, managed);
  }
}
