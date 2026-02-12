import { readFile, writeFile, rename, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCKFILE = "sibyl-lock.json";

export type PackageType = "skill" | "agent" | "command";

export interface LockEntry {
  type: PackageType;
  org: string;
  repo: string;
  path: string;
  ref: string;
  commit: string;
  name: string;
}

export interface Lockfile {
  packages: Record<string, LockEntry>;
}

function lockfilePath(root: string): string {
  return join(root, LOCKFILE);
}

/**
 * Read the lockfile. Returns { packages: {} } if not found.
 */
export async function readLock(root: string): Promise<Lockfile> {
  try {
    const raw = await readFile(lockfilePath(root), "utf8");
    return JSON.parse(raw) as Lockfile;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { packages: {} };
    }
    throw err;
  }
}

/**
 * Write the lockfile atomically (write to temp, then rename).
 */
export async function writeLock(root: string, data: Lockfile): Promise<void> {
  const dest = lockfilePath(root);
  const dir = await mkdtemp(join(tmpdir(), "sibyl-"));
  const tmp = join(dir, "lock.json");
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmp, dest);
}

export interface AddEntryInput extends LockEntry {
  key: string;
}

/**
 * Add or update a package entry in the lockfile.
 */
export async function addEntry(
  root: string,
  entry: AddEntryInput,
): Promise<Lockfile> {
  const lock = await readLock(root);
  lock.packages[entry.key] = {
    type: entry.type,
    org: entry.org,
    repo: entry.repo,
    path: entry.path,
    ref: entry.ref,
    commit: entry.commit,
    name: entry.name,
  };
  await writeLock(root, lock);
  return lock;
}

/**
 * Remove a package entry by key.
 */
export async function removeEntry(
  root: string,
  key: string,
): Promise<Lockfile> {
  const lock = await readLock(root);
  delete lock.packages[key];
  await writeLock(root, lock);
  return lock;
}

/**
 * Find entries matching a type and/or name.
 */
export function findEntries(
  lock: Lockfile,
  filter: { type?: PackageType; name?: string } = {},
): Array<[string, LockEntry]> {
  return Object.entries(lock.packages).filter(([, entry]) => {
    if (filter.type && entry.type !== filter.type) return false;
    if (filter.name && entry.name !== filter.name) return false;
    return true;
  });
}
