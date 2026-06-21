import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses flags, values, and a file", () => {
    expect(parseArgs(["file.txt", "--expires", "3d", "--qr"])).toEqual({
      positionals: ["file.txt"], options: { expires: "3d", qr: true },
    });
  });

  it("preserves values containing equals", () => {
    expect(parseArgs(["--server=https://example.test", "file"])).toEqual({
      positionals: ["file"], options: { server: "https://example.test" },
    });
  });

  it("rejects missing option values", () => {
    expect(() => parseArgs(["file", "--expires"])).toThrow("requires a value");
  });
});
