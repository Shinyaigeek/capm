import { unlinkPackage } from "../linker.js";
import { findEntries, readLock, removeEntry } from "../lockfile.js";
import type { PackageType } from "../lockfile.js";
import { removeFromStore, storePath } from "../store.js";

/**
 * Uninstall a skill/agent/command by name.
 */
export async function uninstall(type: PackageType, name: string, root: string): Promise<void> {
  const lock = await readLock(root);
  const matches = findEntries(lock, { type, name });

  if (matches.length === 0) {
    console.log(`No ${type} named "${name}" found.`);
    return;
  }

  for (const [key, entry] of matches) {
    const storePathAbs = storePath(root, {
      org: entry.org,
      repo: entry.repo,
      commit: entry.commit,
      path: entry.path,
    });

    await unlinkPackage(root, type, entry.name, storePathAbs);
    await removeFromStore(root, {
      org: entry.org,
      repo: entry.repo,
      commit: entry.commit,
      path: entry.path,
    });
    await removeEntry(root, key);

    console.log(`Uninstalled ${type} "${entry.name}"`);
  }
}
