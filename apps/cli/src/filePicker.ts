import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { stdin, stdout } from "node:process";
import prompts from "prompts";

const IGNORED_DIR_NAMES = new Set(["node_modules", ".git", "dist", "dist-sea", "build", "coverage"]);
const UP = "..";

export interface DirListing { directories: string[]; files: string[] }

export async function listDirectory(dir: string): Promise<DirListing> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return { directories: [], files: [] }; }
  const directories: string[] = [];
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      directories.push(entry.name);
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  directories.sort();
  files.sort();
  return { directories, files };
}

const SEGMENT_BOUNDARY = /[/_\-. ]/;

export function fuzzyScore(query: string, candidate: string): number | null {
  if (query.length === 0) return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  let score = 0;
  let qi = 0;
  let run = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) { run = 0; continue; }
    run++;
    let charScore = 1 + run * 2;
    const prev = candidate[ci - 1];
    if (ci === 0 || (prev !== undefined && SEGMENT_BOUNDARY.test(prev))) charScore += 8;
    if (candidate[ci] === query[qi]) charScore += 1;
    score += charScore;
    qi++;
  }
  if (qi < q.length) return null;
  return score - candidate.length * 0.01;
}

export interface RankedFile { path: string; score: number }

export function rankFiles(query: string, files: readonly string[]): RankedFile[] {
  const ranked: RankedFile[] = [];
  for (const path of files) {
    const score = fuzzyScore(query, path);
    if (score !== null) ranked.push({ path, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

export async function suggestEntries(input: string, labels: readonly string[], canGoUp: boolean): Promise<Array<{ title: string; value: string }>> {
  const ranked = rankFiles(input, labels).map((r) => ({ title: r.path, value: r.path }));
  return canGoUp ? [{ title: `${UP}/`, value: UP }, ...ranked] : ranked;
}

function eraseLastLine(): void {
  if (stdout.isTTY) stdout.write("\x1b[1A\x1b[2K");
}

export async function pickFile(root: string = process.cwd()): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("no file given and no interactive terminal available — pass a file path, e.g. sealdrop send ./document.pdf");
  }
  const limit = Math.max(3, Math.min(10, (stdout.rows ?? 24) - 4));
  let currentDir = root;
  for (;;) {
    const { directories, files } = await listDirectory(currentDir);
    const canGoUp = currentDir !== root;
    const labels = [...directories.map((d) => `${d}/`), ...files];
    if (labels.length === 0 && !canGoUp) throw new Error("no files found to pick from — pass a file path directly");
    const where = currentDir === root ? "" : ` — ${relative(root, currentDir).split(sep).join("/")}`;
    const choices = [
      ...(canGoUp ? [{ title: `${UP}/`, value: UP }] : []),
      ...labels.map((label) => ({ title: label, value: label })),
    ];
    const response = await prompts(
      {
        type: "autocomplete",
        name: "entry",
        message: `Select a file to send${where} (Ctrl+C to cancel)`,
        choices,
        suggest: (input: string) => suggestEntries(input, labels, canGoUp),
        limit,
      },
      { onCancel: () => { throw new Error("cancelled"); } },
    );
    if (typeof response.entry !== "string") throw new Error("no file selected");
    if (response.entry === UP) { eraseLastLine(); currentDir = dirname(currentDir); continue; }
    if (response.entry.endsWith("/")) { eraseLastLine(); currentDir = join(currentDir, response.entry.slice(0, -1)); continue; }
    return relative(root, join(currentDir, response.entry)).split(sep).join("/");
  }
}
