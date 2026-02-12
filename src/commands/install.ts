import { rm } from "node:fs/promises";
import { shallowClone } from "../git.js";
import { link } from "../linker.js";
import { addEntry, readLock } from "../lockfile.js";
import type { PackageType } from "../lockfile.js";
import {
  SYMBOLS,
  commitHash,
  dim,
  green,
  pkgName,
  specRef,
  spinner,
  typeBadge,
  warn,
} from "../log.js";
import { nameFromSpec, parseSpec, specKey } from "../spec.js";
import { placeInStore } from "../store.js";

/**
 * Install a skill/agent/command from a GitHub spec.
 */
export async function install(type: PackageType, raw: string, root: string): Promise<void> {
  const spec = parseSpec(raw);
  const name = nameFromSpec(spec);
  const key = specKey(spec);

  // Check if already installed
  const lock = await readLock(root);
  const existing = lock.packages[key];
  if (existing && existing.ref === spec.ref) {
    warn(
      `${typeBadge(type)} ${pkgName(name)} is already installed ${commitHash(existing.commit)}  ${specRef(key, spec.ref)}`,
    );
    return;
  }

  const s = spinner(`Cloning ${dim(`${spec.org}/${spec.repo}`)}${dim("@")}${spec.ref}`);

  try {
    const { tmpDir, commit } = await shallowClone(spec.org, spec.repo, spec.ref);

    try {
      s.update(`Copying ${pkgName(name)} to store`);

      const dest = await placeInStore(
        root,
        { org: spec.org, repo: spec.repo, commit, path: spec.path },
        tmpDir,
      );

      s.update(`Linking ${pkgName(name)}`);

      await link(root, type, name, dest);

      await addEntry(root, {
        key,
        type,
        org: spec.org,
        repo: spec.repo,
        path: spec.path,
        ref: spec.ref,
        commit,
        name,
      });

      s.stop(
        `${green(SYMBOLS.ok)} Installed ${typeBadge(type)} ${pkgName(name)} ${commitHash(commit)}  ${specRef(key, spec.ref)}`,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    s.stop();
    throw err;
  }
}
