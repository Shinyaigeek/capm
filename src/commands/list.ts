import { findEntries, readLock } from "../lockfile.js";
import type { PackageType } from "../lockfile.js";
import { commitHash, header, item, pkgName, specRef, typeBadge, warn } from "../log.js";

/**
 * List installed packages, optionally filtered by type.
 */
export async function list(type: PackageType | undefined, root: string): Promise<void> {
  const lock = await readLock(root);
  const entries = findEntries(lock, type ? { type } : {});

  if (entries.length === 0) {
    warn(type ? `No ${type}s installed.` : "No packages installed.");
    return;
  }

  const label = type ? `${type}s` : "packages";
  header(`${entries.length} ${label} installed`);
  console.log();

  for (const [key, entry] of entries) {
    item(
      `${pkgName(entry.name)} ${typeBadge(entry.type)}  ${specRef(key, entry.ref)}  ${commitHash(entry.commit)}`,
    );
  }

  console.log();
}
