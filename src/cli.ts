import { Command } from "commander";
import { install } from "./commands/install.js";
import { list } from "./commands/list.js";
import { restore } from "./commands/restore.js";
import { uninstall } from "./commands/uninstall.js";
import { update } from "./commands/update.js";
import type { PackageType } from "./lockfile.js";

export function createCli(root?: string): Command {
  const resolvedRoot = root ?? process.cwd();

  const program = new Command();
  program
    .name("capm")
    .description("Claude Code package manager for skills, agents, and commands")
    .version("0.0.1");

  // capm i — restore from lockfile
  program
    .command("i")
    .description("Restore all packages from capm-lock.json")
    .action(() => restore(resolvedRoot));

  // capm update [filter] — update all packages (or filtered by org/repo)
  program
    .command("update [filter]")
    .description("Update all packages (or filter by <org>/<repo>)")
    .action((filter?: string) => update(undefined, filter, resolvedRoot));

  // Helper to create type-specific subcommands (skill, agent, command)
  function registerTypeCommand(type: PackageType): void {
    const cmd = program.command(type).description(`Manage ${type}s`);

    cmd
      .command("i <spec>")
      .description(`Install a ${type} from <org>/<repo>/<path>[@ref]`)
      .action((spec: string) => install(type, spec, resolvedRoot));

    cmd
      .command("ls")
      .description(`List installed ${type}s`)
      .action(() => list(type, resolvedRoot));

    cmd
      .command("rm <name>")
      .description(`Uninstall a ${type} by name`)
      .action((name: string) => uninstall(type, name, resolvedRoot));

    cmd
      .command("update [filter]")
      .description(`Update ${type}s (optionally filter by <org>/<repo> or <org>/<repo>/<path>)`)
      .action((filter?: string) => update(type, filter, resolvedRoot));
  }

  registerTypeCommand("skill");
  registerTypeCommand("agent");
  registerTypeCommand("command");

  return program;
}
