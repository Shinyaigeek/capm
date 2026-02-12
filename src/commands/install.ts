import { rm } from "node:fs/promises";
import { shallowClone } from "../git.js";
import { link } from "../linker.js";
import { addEntry } from "../lockfile.js";
import type { PackageType } from "../lockfile.js";
import { nameFromSpec, parseSpec, specKey } from "../spec.js";
import { placeInStore } from "../store.js";

/**
 * Install a skill/agent/command from a GitHub spec.
 */
export async function install(type: PackageType, raw: string, root: string): Promise<void> {
  const spec = parseSpec(raw);
  const name = nameFromSpec(spec);
  const key = specKey(spec);

  console.log(`Installing ${type} "${name}" from ${key}@${spec.ref}...`);

  const { tmpDir, commit } = await shallowClone(spec.org, spec.repo, spec.ref);

  try {
    const dest = await placeInStore(
      root,
      { org: spec.org, repo: spec.repo, commit, path: spec.path },
      tmpDir,
    );

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

    console.log(`Installed ${type} "${name}" (${commit.slice(0, 8)})`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
