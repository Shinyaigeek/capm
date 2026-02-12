import { rm } from "node:fs/promises";
import { shallowClone } from "../git.js";
import { link } from "../linker.js";
import { addEntry, readLock } from "../lockfile.js";
import type { LockEntry, PackageType } from "../lockfile.js";
import {
  SYMBOLS,
  bold,
  commitHash,
  dim,
  green,
  header,
  item,
  pkgName,
  spinner,
  success,
  typeBadge,
  warn,
  yellow,
} from "../log.js";
import { placeInStore } from "../store.js";

interface UpdateGroup {
  org: string;
  repo: string;
  ref: string;
  items: Array<{ key: string; entry: LockEntry }>;
}

/**
 * Determine which lockfile entries match the given filter.
 *
 * - No filter → all entries
 * - "org/repo" → entries whose org and repo match
 * - "org/repo/path..." → entry whose key matches exactly
 */
function matchEntries(
  entries: Array<[string, LockEntry]>,
  type: PackageType | undefined,
  filter: string | undefined,
): Array<[string, LockEntry]> {
  let result = entries;

  if (type) {
    result = result.filter(([, e]) => e.type === type);
  }

  if (!filter) return result;

  const parts = filter.replace(/@.*$/, "").split("/");

  if (parts.length === 2) {
    // org/repo — match all entries from that repo
    const [org, repo] = parts;
    result = result.filter(([, e]) => e.org === org && e.repo === repo);
  } else if (parts.length >= 3) {
    // org/repo/path — exact key match
    const key = parts.join("/");
    result = result.filter(([k]) => k === key);
  }

  return result;
}

/**
 * Update packages to the latest commit on their tracked ref.
 *
 * - `sibyl update` — update all packages
 * - `sibyl skill update` — update all skills
 * - `sibyl skill update org/repo` — update all skills from that repo
 * - `sibyl skill update org/repo/path` — update a specific package
 */
export async function update(
  type: PackageType | undefined,
  filter: string | undefined,
  root: string,
): Promise<void> {
  const lock = await readLock(root);
  const allEntries = Object.entries(lock.packages);

  if (allEntries.length === 0) {
    warn("No packages in lockfile.");
    return;
  }

  const matched = matchEntries(allEntries, type, filter);

  if (matched.length === 0) {
    const label = filter ?? (type ? `${type}s` : "packages");
    warn(`No matching packages found for ${bold(label)}.`);
    return;
  }

  const what = type ? `${type}(s)` : "package(s)";
  header(`Checking ${bold(String(matched.length))} ${what} for updates`);
  console.log();

  // Group by org/repo/ref so we clone once per unique combo
  const groups = new Map<string, UpdateGroup>();
  for (const [key, entry] of matched) {
    const groupKey = `${entry.org}/${entry.repo}@${entry.ref}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        org: entry.org,
        repo: entry.repo,
        ref: entry.ref,
        items: [],
      });
    }
    groups.get(groupKey)?.items.push({ key, entry });
  }

  let updatedCount = 0;

  for (const group of groups.values()) {
    const repoLabel = dim(`${group.org}/${group.repo}`);
    const s = spinner(`Fetching ${repoLabel}${dim("@")}${group.ref}`);

    let tmpDir: string;
    let newCommit: string;

    try {
      const result = await shallowClone(group.org, group.repo, group.ref);
      tmpDir = result.tmpDir;
      newCommit = result.commit;
      s.stop();
    } catch (err) {
      s.stop();
      throw err;
    }

    try {
      for (const { key, entry } of group.items) {
        if (entry.commit === newCommit) {
          item(`${pkgName(entry.name)} ${typeBadge(entry.type)}  ${dim("already up to date")}`);
          continue;
        }

        const dest = await placeInStore(
          root,
          { org: entry.org, repo: entry.repo, commit: newCommit, path: entry.path },
          tmpDir,
        );

        await link(root, entry.type, entry.name, dest);

        await addEntry(root, {
          key,
          type: entry.type,
          org: entry.org,
          repo: entry.repo,
          path: entry.path,
          ref: entry.ref,
          commit: newCommit,
          name: entry.name,
        });

        item(
          `${green(SYMBOLS.ok)} ${pkgName(entry.name)} ${typeBadge(entry.type)}  ${commitHash(entry.commit)} ${yellow(SYMBOLS.arrow)} ${commitHash(newCommit)}`,
        );
        updatedCount++;
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  console.log();
  if (updatedCount === 0) {
    success("Everything is up to date.");
  } else {
    success(`Updated ${bold(String(updatedCount))} ${what}.`);
  }
}
