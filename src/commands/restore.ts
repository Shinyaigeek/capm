import { rm } from "node:fs/promises";
import { cloneAtCommit, shallowClone } from "../git.js";
import { link } from "../linker.js";
import { readLock } from "../lockfile.js";
import type { LockEntry } from "../lockfile.js";
import {
  bold,
  commitHash,
  dim,
  header,
  item,
  pkgName,
  spinner,
  success,
  typeBadge,
  warn,
} from "../log.js";
import { existsInStore, placeInStore, storePath } from "../store.js";

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
    warn("No packages in lockfile.");
    return;
  }

  header(`Restoring ${bold(String(entries.length))} package(s)`);
  console.log();

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
    groups.get(groupKey)?.items.push({ key, ...entry });
  }

  for (const group of groups.values()) {
    const needsClone: GroupItem[] = [];
    for (const groupItem of group.items) {
      const exists = await existsInStore(root, {
        org: groupItem.org,
        repo: groupItem.repo,
        commit: groupItem.commit,
        path: groupItem.path,
      });
      if (!exists) {
        needsClone.push(groupItem);
      }
    }

    let tmpDir: string | null = null;

    if (needsClone.length > 0) {
      const repoLabel = dim(`${group.org}/${group.repo}`);
      const s = spinner(`Fetching ${repoLabel} ${commitHash(group.commit)}`);

      try {
        try {
          const result = await cloneAtCommit(group.org, group.repo, group.commit);
          tmpDir = result.tmpDir;
        } catch {
          s.update(`Fetching ${repoLabel}${dim("@")}${group.ref}`);
          const result = await shallowClone(group.org, group.repo, group.ref);
          tmpDir = result.tmpDir;
        }
        s.stop();
      } catch (err) {
        s.stop();
        throw err;
      }
    }

    try {
      for (const groupItem of group.items) {
        const loc = {
          org: groupItem.org,
          repo: groupItem.repo,
          commit: groupItem.commit,
          path: groupItem.path,
        };

        const exists = await existsInStore(root, loc);
        let dest: string;

        if (!exists && tmpDir) {
          dest = await placeInStore(root, loc, tmpDir);
        } else {
          dest = storePath(root, loc);
        }

        await link(root, groupItem.type, groupItem.name, dest);
        item(`${pkgName(groupItem.name)} ${typeBadge(groupItem.type)}`);
      }
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }
  }

  console.log();
  success(`Restored ${bold(String(entries.length))} package(s)`);
}
