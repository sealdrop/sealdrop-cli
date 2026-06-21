import { describe, expect, it } from "vitest";
import { parseShareUrl } from "./download.js";

describe("parseShareUrl", () => {
  it("extracts a send file id without exposing the fragment", () => {
    const parsed = parseShareUrl("https://sealdrop.io/s/abc123#key=secret");
    expect(parsed.fileId).toBe("abc123");
    expect(parsed.url.hash).toBe("#key=secret");
  });

  it("rejects non-send routes", () => {
    expect(() => parseShareUrl("https://sealdrop.io/r/abc#privateKey=x")).toThrow();
  });
});
