import { Command } from "commander";
import { install } from "./commands/install.js";
import { list } from "./commands/list.js";
import { restore } from "./commands/restore.js";
import { uninstall } from "./commands/uninstall.js";
import type { PackageType } from "./lockfile.js";

export function createCli(): Command {
  const root = process.cwd();

  const program = new Command();
  program
    .name("sibyl")
    .description("Claude Code package manager for skills, agents, and commands")
    .version("0.0.1");

  // sibyl i — restore from lockfile
  program
    .command("i")
    .description("Restore all packages from sibyl-lock.json")
    .action(() => restore(root));

  // Helper to create type-specific subcommands (skill, agent, command)
  function registerTypeCommand(type: PackageType): void {
    const cmd = program.command(type).description(`Manage ${type}s`);

    cmd
      .command("i <spec>")
      .description(`Install a ${type} from <org>/<repo>/<path>[@ref]`)
      .action((spec: string) => install(type, spec, root));

    cmd
      .command("ls")
      .description(`List installed ${type}s`)
      .action(() => list(type, root));

    cmd
      .command("rm <name>")
      .description(`Uninstall a ${type} by name`)
      .action((name: string) => uninstall(type, name, root));
  }

  registerTypeCommand("skill");
  registerTypeCommand("agent");
  registerTypeCommand("command");

  return program;
}
