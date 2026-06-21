import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fuzzyScore, listDirectory, rankFiles, suggestEntries } from "./filePicker.js";

describe("fuzzyScore", () => {
  it("matches everything with an empty query", () => {
    expect(fuzzyScore("", "anything.txt")).toBe(0);
  });

  it("returns null when a query character is missing", () => {
    expect(fuzzyScore("xyz", "abc.txt")).toBeNull();
  });

  it("matches a simple subsequence", () => {
    expect(fuzzyScore("fbr", "foobar.txt")).not.toBeNull();
  });

  it("ranks a contiguous match higher than a scattered match of the same letters", () => {
    const contiguous = fuzzyScore("foo", "zzfoozz.txt")!;
    const sparse = fuzzyScore("foo", "zfzozoz.txt")!;
    expect(contiguous).toBeGreaterThan(sparse);
  });

  it("ranks a segment-boundary match higher than a mid-segment match", () => {
    const boundary = fuzzyScore("report", "report.pdf")!;
    const midWord = fuzzyScore("report", "oldreport.pdf")!;
    expect(boundary).toBeGreaterThan(midWord);
  });

  it("is case-insensitive but scores an exact-case match at least as high", () => {
    expect(fuzzyScore("ABC", "abc.txt")).not.toBeNull();
    expect(fuzzyScore("abc", "abc.txt")!).toBeGreaterThanOrEqual(fuzzyScore("ABC", "abc.txt")!);
  });
});

describe("rankFiles", () => {
  it("filters out non-matches and sorts descending by score", () => {
    const files = ["foobar.txt", "baz.txt", "foo.txt"];
    const ranked = rankFiles("foo", files);
    expect(ranked.map((r) => r.path)).toEqual(["foo.txt", "foobar.txt"]);
  });

  it("returns all files for an empty query", () => {
    const files = ["a.txt", "b.txt"];
    expect(rankFiles("", files).map((r) => r.path)).toEqual(files);
  });
});

describe("suggestEntries", () => {
  it("returns ranked entries as title/value choice pairs", async () => {
    const labels = ["foo.txt", "bar.txt"];
    await expect(suggestEntries("foo", labels, false)).resolves.toEqual([{ title: "foo.txt", value: "foo.txt" }]);
  });

  it("pins an up entry at the top regardless of the query", async () => {
    const labels = ["foo.txt", "bar.txt"];
    const result = await suggestEntries("foo", labels, true);
    expect(result[0]).toEqual({ title: "../", value: ".." });
    expect(result.slice(1)).toEqual([{ title: "foo.txt", value: "foo.txt" }]);
  });
});

describe("listDirectory", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

  async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "sealdrop-picker-"));
    dirs.push(dir);
    return dir;
  }

  it("lists immediate files and directories, sorted", async () => {
    const dir = await makeDir();
    await mkdir(join(dir, "sub"), { recursive: true });
    await writeFile(join(dir, "top.txt"), "a");
    const listing = await listDirectory(dir);
    expect(listing).toEqual({ directories: ["sub"], files: ["top.txt"] });
  });

  it("does not descend into nested directories", async () => {
    const dir = await makeDir();
    await mkdir(join(dir, "sub"), { recursive: true });
    await writeFile(join(dir, "sub", "nested.txt"), "a");
    const listing = await listDirectory(dir);
    expect(listing).toEqual({ directories: ["sub"], files: [] });
  });

  it("excludes node_modules and .git", async () => {
    const dir = await makeDir();
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, "real.txt"), "c");
    const listing = await listDirectory(dir);
    expect(listing).toEqual({ directories: [], files: ["real.txt"] });
  });

  it("excludes dotfiles and dot-directories", async () => {
    const dir = await makeDir();
    await writeFile(join(dir, ".env"), "secret");
    await mkdir(join(dir, ".hidden"), { recursive: true });
    await writeFile(join(dir, "visible.txt"), "b");
    const listing = await listDirectory(dir);
    expect(listing).toEqual({ directories: [], files: ["visible.txt"] });
  });

  it("excludes symlinked directories and files", async () => {
    const dir = await makeDir();
    await mkdir(join(dir, "real-dir"), { recursive: true });
    await writeFile(join(dir, "real.txt"), "a");
    await symlink(join(dir, "real-dir"), join(dir, "linked-dir"));
    await symlink(join(dir, "real.txt"), join(dir, "linked.txt"));
    const listing = await listDirectory(dir);
    expect(listing).toEqual({ directories: ["real-dir"], files: ["real.txt"] });
  });

  it("returns an empty listing for an unreadable directory rather than throwing", async () => {
    const listing = await listDirectory(join(tmpdir(), "sealdrop-picker-does-not-exist"));
    expect(listing).toEqual({ directories: [], files: [] });
  });
});
