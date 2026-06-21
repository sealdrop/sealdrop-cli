export interface ParsedArgs { positionals: string[]; options: Record<string, string | boolean> }

const BOOLEAN_OPTIONS = new Set([
  "json", "qr", "access-code", "handoff", "force", "no-delete-token", "help", "version", "passphrase",
]);

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") { positionals.push(...args.slice(i + 1)); break; }
    if (!arg.startsWith("--")) { positionals.push(arg); continue; }
    const equal = arg.indexOf("=");
    const key = arg.slice(2, equal === -1 ? undefined : equal);
    if (BOOLEAN_OPTIONS.has(key)) { options[key] = true; continue; }
    if (equal !== -1) { options[key] = arg.slice(equal + 1); continue; }
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return { positionals, options };
}

export function stringOption(options: ParsedArgs["options"], key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}
