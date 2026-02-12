import { rm } from "node:fs/promises";
import { readLock } from "../lockfile.js";
import type { LockEntry } from "../lockfile.js";
import { placeInStore, existsInStore, storePath } from "../store.js";
import { link } from "../linker.js";
import { shallowClone, cloneAtCommit } from "../git.js";

interface GroupItem extends LockEntry {
  key: string;
}

interface CloneGroup {
  org: string;
  repo: string;
  commit: string;
  ref: string;
  items: GroupItem[];
}

/**
 * Restore all packages from the lockfile.
 * Groups packages by org/repo/commit to minimize clones.
 */
export async function restore(root: string): Promise<void> {
  const lock = await readLock(root);
  const entries = Object.entries(lock.packages);

  if (entries.length === 0) {
    console.log("No packages in lockfile.");
    return;
  }

  console.log(`Restoring ${entries.length} package(s)...\n`);

  // Group by org/repo/commit to clone once per unique combo
  const groups = new Map<string, CloneGroup>();
  for (const [key, entry] of entries) {
    const groupKey = `${entry.org}/${entry.repo}/${entry.commit}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        org: entry.org,
        repo: entry.repo,
        commit: entry.commit,
        ref: entry.ref,
        items: [],
      });
    }
    groups.get(groupKey)!.items.push({ key, ...entry });
  }

  for (const group of groups.values()) {
    const needsClone: GroupItem[] = [];
    for (const item of group.items) {
      const exists = await existsInStore(root, {
        org: item.org,
        repo: item.repo,
        commit: item.commit,
        path: item.path,
      });
      if (!exists) {
        needsClone.push(item);
      }
    }

    let tmpDir: string | null = null;

    if (needsClone.length > 0) {
      try {
        const result = await cloneAtCommit(
          group.org,
          group.repo,
          group.commit,
        );
        tmpDir = result.tmpDir;
      } catch {
        console.log(
          `  Commit ${group.commit.slice(0, 8)} not fetchable, trying ref "${group.ref}"...`,
        );
        const result = await shallowClone(group.org, group.repo, group.ref);
        tmpDir = result.tmpDir;
      }
    }

    try {
      for (const item of group.items) {
        const loc = {
          org: item.org,
          repo: item.repo,
          commit: item.commit,
          path: item.path,
        };

        const exists = await existsInStore(root, loc);
        let dest: string;

        if (!exists && tmpDir) {
          dest = await placeInStore(root, loc, tmpDir);
        } else {
          dest = storePath(root, loc);
        }

        await link(root, item.type, item.name, dest);
        console.log(`  Restored ${item.type} "${item.name}"`);
      }
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }
  }

  console.log(`\nRestored ${entries.length} package(s).`);
}
