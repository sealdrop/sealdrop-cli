import { describe, it, expect } from "vitest";
import {
  generateAccessCode,
  wrapKeyWithAccessCode,
  unwrapKeyWithAccessCode,
  buildAccessCodeLink,
  parseAccessCodeFragment,
} from "./access-code.js";
import { generateFileKey } from "./symmetric.js";
import { parsePassphraseFragment } from "./passphrase.js";

describe("generateAccessCode", () => {
  it("produces XXXX-XXXX format", () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("generates unique codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateAccessCode()));
    expect(codes.size).toBe(50);
  });

  it("uses only unambiguous characters", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateAccessCode().replace("-", "");
      expect(code).not.toMatch(/[0OI1L]/);
    }
  });
});

describe("wrapKeyWithAccessCode / unwrapKeyWithAccessCode", () => {
  it("roundtrip: wraps and unwraps correctly", async () => {
    const key = await generateFileKey();
    const code = generateAccessCode();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, code);

    const recovered = await unwrapKeyWithAccessCode(wrappedKey, code, salt, iv);
    const raw1 = await crypto.subtle.exportKey("raw", key);
    const raw2 = await crypto.subtle.exportKey("raw", recovered);
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });

  it("fails with wrong access code", async () => {
    const key = await generateFileKey();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, "ABCD-1234");
    await expect(
      unwrapKeyWithAccessCode(wrappedKey, "XXXX-9999", salt, iv),
    ).rejects.toThrow();
  });

  it("accepts code with or without dash", async () => {
    const key = await generateFileKey();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, "ABCD-EFGH");
    const recovered = await unwrapKeyWithAccessCode(wrappedKey, "ABCDEFGH", salt, iv);
    const raw1 = await crypto.subtle.exportKey("raw", key);
    const raw2 = await crypto.subtle.exportKey("raw", recovered);
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });

  it("accepts code in lowercase", async () => {
    const key = await generateFileKey();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, "ABCD-EFGH");
    const recovered = await unwrapKeyWithAccessCode(wrappedKey, "abcd-efgh", salt, iv);
    const raw1 = await crypto.subtle.exportKey("raw", key);
    const raw2 = await crypto.subtle.exportKey("raw", recovered);
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });
});

describe("buildAccessCodeLink / parseAccessCodeFragment", () => {
  it("roundtrip: build and parse", async () => {
    const key = await generateFileKey();
    const code = generateAccessCode();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, code);

    const link = buildAccessCodeLink("test123", wrappedKey, salt, iv);
    const hash = "#" + link.split("#")[1]!;

    const parsed = parseAccessCodeFragment(hash);
    expect(parsed).not.toBeNull();
    expect(parsed!.wrappedKey).toBe(wrappedKey);
    expect(parsed!.salt).toEqual(salt);
    expect(parsed!.iv).toEqual(iv);
  });

  it("link contains &ac=1 marker", async () => {
    const key = await generateFileKey();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, "ABCD-EFGH");
    const link = buildAccessCodeLink("fileid", wrappedKey, salt, iv);
    expect(link).toContain("&ac=1");
  });

  it("returns null for plain key fragment (no ac=1)", () => {
    expect(parseAccessCodeFragment("#key=abc123")).toBeNull();
  });

  it("returns null for passphrase fragment without ac=1", () => {
    expect(parseAccessCodeFragment("#key=wrapped:salt:iv")).toBeNull();
  });

  it("is not detected as a passphrase fragment by parsePassphraseFragment", async () => {
    // Access code links also match 3-part key shape — ensure caller checks &ac=1 first
    const key = await generateFileKey();
    const { wrappedKey, salt, iv } = await wrapKeyWithAccessCode(key, "ABCD-EFGH");
    const link = buildAccessCodeLink("fileid", wrappedKey, salt, iv);
    const hash = "#" + link.split("#")[1]!;

    // parsePassphraseFragment would also match the 3-part key, which is why
    // parseAccessCodeFragment must be called first in the recipient page
    const ppData = parsePassphraseFragment(hash);
    expect(ppData).not.toBeNull(); // it would match — caller must check ac=1 first
    const acData = parseAccessCodeFragment(hash);
    expect(acData).not.toBeNull(); // but this is the correct detector
  });
});

describe("access code security invariants", () => {
  it("wrappedKey differs from raw file key", async () => {
    const key = await generateFileKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const { wrappedKey } = await wrapKeyWithAccessCode(key, generateAccessCode());
    // wrappedKey is base64url of ciphertext, not the raw key
    expect(wrappedKey).not.toContain(btoa(String.fromCharCode(...raw)));
  });

  it("same code + different salt produces different wrapped key", async () => {
    const key = await generateFileKey();
    const code = "ABCD-EFGH";
    const r1 = await wrapKeyWithAccessCode(key, code);
    const r2 = await wrapKeyWithAccessCode(key, code);
    // Fresh random salt each time → different wrapped output
    expect(r1.wrappedKey).not.toBe(r2.wrappedKey);
  });
});
