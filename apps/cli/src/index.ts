import { parseArgs } from "./args.js";
import { sendCommand } from "./send.js";
import { downloadCommand } from "./download.js";
import { deleteCommand, handoffCommand } from "./other-commands.js";

const VERSION = "0.1.2";

const HELP = `SealDrop CLI ${VERSION}

Usage:
  sealdrop send <file> [--expires open-once|1h|today|3d|7d] [--padding standard|enhanced|maximum]
                    [--note text] [--passphrase] [--passphrase-file path|-]
                    [--access-code] [--handoff] [--qr] [--no-delete-token]
  sealdrop download <share-url> [--output path] [--force]
                    [--passphrase-file path|-] [--access-code-file path|-]
  sealdrop delete <delete-url>
  sealdrop handoff <share-url> [--qr]

Global options: --server URL, --json, --help, --version
Quote URLs containing # so the shell preserves the encryption fragment.`;

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  if (!command || command === "help" || argv.includes("--help")) { console.log(HELP); return; }
  if (command === "--version" || argv.includes("--version")) { console.log(VERSION); return; }
  const args = parseArgs(argv.slice(1));
  const input = args.positionals[0];
  if (!input) throw Object.assign(new Error(`${command} requires an input`), { usage: true });
  if (args.positionals.length > 1) throw Object.assign(new Error("too many positional arguments"), { usage: true });
  switch (command) {
    case "send": await sendCommand(input, args); break;
    case "download": await downloadCommand(input, args); break;
    case "delete": await deleteCommand(input, args); break;
    case "handoff": await handoffCommand(input, args); break;
    default: throw Object.assign(new Error(`unknown command: ${command}`), { usage: true });
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sealdrop: ${message}`);
  process.exitCode = typeof error === "object" && error !== null && "usage" in error ? 2 : 1;
});
