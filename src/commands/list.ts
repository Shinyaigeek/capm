import { findEntries, readLock } from "../lockfile.js";
import type { PackageType } from "../lockfile.js";

/**
 * List installed packages, optionally filtered by type.
 */
export async function list(type: PackageType | undefined, root: string): Promise<void> {
  const lock = await readLock(root);
  const entries = findEntries(lock, type ? { type } : {});

  if (entries.length === 0) {
    console.log(type ? `No ${type}s installed.` : "No packages installed.");
    return;
  }

  const label = type ? `${type}s` : "packages";
  console.log(`Installed ${label}:\n`);

  for (const [key, entry] of entries) {
    const shortCommit = entry.commit.slice(0, 8);
    console.log(`  ${entry.name} (${entry.type})`);
    console.log(`    ${key}@${entry.ref} [${shortCommit}]`);
  }

  console.log();
}
