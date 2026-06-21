import { describe, it, expect } from "vitest";
import {
  deriveKeyFromPassphrase,
  wrapKeyWithPassphrase,
  unwrapKeyWithPassphrase,
  buildPassphraseLink,
  parsePassphraseFragment,
  SALT_BYTES,
} from "./passphrase.js";
import { generateFileKey } from "./symmetric.js";

describe("deriveKeyFromPassphrase", () => {
  it("derives a 256-bit AES-GCM key from a passphrase and salt", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await deriveKeyFromPassphrase("correct horse battery staple", salt);
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it("same passphrase + salt produces the same key", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const a = await deriveKeyFromPassphrase("mypassword", salt);
    const b = await deriveKeyFromPassphrase("mypassword", salt);
    const rawA = await crypto.subtle.exportKey("raw", a);
    const rawB = await crypto.subtle.exportKey("raw", b);
    expect(new Uint8Array(rawA)).toEqual(new Uint8Array(rawB));
  });

  it("different passphrase produces different key", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const a = await deriveKeyFromPassphrase("passphrase1", salt);
    const b = await deriveKeyFromPassphrase("passphrase2", salt);
    const rawA = await crypto.subtle.exportKey("raw", a);
    const rawB = await crypto.subtle.exportKey("raw", b);
    expect(new Uint8Array(rawA)).not.toEqual(new Uint8Array(rawB));
  });

  it("different salt produces different key", async () => {
    const salt1 = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const salt2 = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const a = await deriveKeyFromPassphrase("passphrase", salt1);
    const b = await deriveKeyFromPassphrase("passphrase", salt2);
    const rawA = await crypto.subtle.exportKey("raw", a);
    const rawB = await crypto.subtle.exportKey("raw", b);
    expect(new Uint8Array(rawA)).not.toEqual(new Uint8Array(rawB));
  });

  it("rejects empty passphrase", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    await expect(deriveKeyFromPassphrase("", salt)).rejects.toThrow();
  });

  it("rejects passphrase shorter than 8 characters", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    await expect(deriveKeyFromPassphrase("short", salt)).rejects.toThrow("at least 8 characters");
  });
});

describe("wrapKeyWithPassphrase / unwrapKeyWithPassphrase", () => {
  it("round-trips a file key through passphrase wrapping", async () => {
    const fileKey = await generateFileKey();
    const passphrase = "my secret passphrase";

    const wrapped = await wrapKeyWithPassphrase(fileKey, passphrase);
    expect(typeof wrapped.wrappedKey).toBe("string");
    expect(wrapped.salt.byteLength).toBe(SALT_BYTES);

    const unwrapped = await unwrapKeyWithPassphrase(
      wrapped.wrappedKey,
      passphrase,
      wrapped.salt,
      wrapped.iv,
    );

    const rawOriginal = await crypto.subtle.exportKey("raw", fileKey);
    const rawUnwrapped = await crypto.subtle.exportKey("raw", unwrapped);
    expect(new Uint8Array(rawUnwrapped)).toEqual(new Uint8Array(rawOriginal));
  });

  it("rejects wrong passphrase", async () => {
    const fileKey = await generateFileKey();
    const wrapped = await wrapKeyWithPassphrase(fileKey, "correct passphrase");

    await expect(
      unwrapKeyWithPassphrase(wrapped.wrappedKey, "wrong passphrase", wrapped.salt, wrapped.iv),
    ).rejects.toThrow();
  });

  it("rejects tampered wrapped key", async () => {
    const fileKey = await generateFileKey();
    const wrapped = await wrapKeyWithPassphrase(fileKey, "passphrase1");

    const tampered = (wrapped.wrappedKey[0] === "A" ? "B" : "A") + wrapped.wrappedKey.slice(1);
    await expect(
      unwrapKeyWithPassphrase(tampered, "passphrase1", wrapped.salt, wrapped.iv),
    ).rejects.toThrow();
  });

  it("rejects wrong salt", async () => {
    const fileKey = await generateFileKey();
    const wrapped = await wrapKeyWithPassphrase(fileKey, "passphrase1");
    const wrongSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    await expect(
      unwrapKeyWithPassphrase(wrapped.wrappedKey, "passphrase1", wrongSalt, wrapped.iv),
    ).rejects.toThrow();
  });

  it("produces different wrapped output for same key with different passphrases", async () => {
    const fileKey = await generateFileKey();
    const a = await wrapKeyWithPassphrase(fileKey, "passphrase1");
    const b = await wrapKeyWithPassphrase(fileKey, "passphrase2");
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });
});

describe("buildPassphraseLink / parsePassphraseFragment", () => {
  it("builds a link with wrapped key and salt", async () => {
    const fileKey = await generateFileKey();
    const wrapped = await wrapKeyWithPassphrase(fileKey, "mypassword");

    const link = buildPassphraseLink("file123", wrapped.wrappedKey, wrapped.salt, wrapped.iv);
    expect(link).toContain("/s/file123");
    expect(link).toContain("#key=");

    const parsed = parsePassphraseFragment(link);
    expect(parsed).not.toBeNull();
    expect(parsed!.wrappedKey).toBe(wrapped.wrappedKey);
  });

  it("returns null when no key fragment present", () => {
    expect(parsePassphraseFragment("")).toBeNull();
    expect(parsePassphraseFragment("#other=xyz")).toBeNull();
  });
});
