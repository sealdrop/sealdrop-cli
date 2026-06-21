import { describe, it, expect } from "vitest";
import { generateFileKey } from "./symmetric.js";
import {
  generateOwnerKeyPair,
  exportPublicKey,
  importPublicKey,
  wrapFileKey,
  unwrapFileKey,
} from "./asymmetric.js";

describe("generateOwnerKeyPair", () => {
  it("returns a CryptoKeyPair with ECDH P-256 keys", async () => {
    const pair = await generateOwnerKeyPair();
    expect(pair.publicKey.type).toBe("public");
    expect(pair.privateKey.type).toBe("private");
    expect(pair.publicKey.algorithm.name).toBe("ECDH");
    expect(pair.privateKey.algorithm.name).toBe("ECDH");
  });

  it("keys are extractable", async () => {
    const pair = await generateOwnerKeyPair();
    expect(pair.publicKey.extractable).toBe(true);
    expect(pair.privateKey.extractable).toBe(true);
  });
});

describe("exportPublicKey / importPublicKey", () => {
  it("round-trips a public key through base64url SPKI", async () => {
    const pair = await generateOwnerKeyPair();
    const exported = await exportPublicKey(pair.publicKey);

    expect(typeof exported).toBe("string");
    expect(exported.length).toBeGreaterThan(0);
    // base64url chars only
    expect(/^[A-Za-z0-9_-]+$/.test(exported)).toBe(true);

    const imported = await importPublicKey(exported);
    expect(imported.type).toBe("public");
    expect(imported.algorithm.name).toBe("ECDH");
  });

  it("two different key pairs produce different exports", async () => {
    const a = await generateOwnerKeyPair();
    const b = await generateOwnerKeyPair();
    expect(await exportPublicKey(a.publicKey)).not.toBe(await exportPublicKey(b.publicKey));
  });
});

describe("wrapFileKey / unwrapFileKey", () => {
  it("round-trips a file key through ECDH wrapping", async () => {
    const ownerPair = await generateOwnerKeyPair();
    const fileKey = await generateFileKey();

    const wrapped = await wrapFileKey(fileKey, ownerPair.publicKey);

    expect(typeof wrapped.wrappedKey).toBe("string");
    expect(typeof wrapped.ephemeralPublicKey).toBe("string");
    expect(typeof wrapped.wrappedKeyIv).toBe("string");

    const unwrapped = await unwrapFileKey(
      wrapped.wrappedKey,
      wrapped.ephemeralPublicKey,
      wrapped.wrappedKeyIv,
      ownerPair.privateKey,
    );

    // Verify the unwrapped key encrypts/decrypts correctly
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array([1, 2, 3, 4]);

    const encWithOriginal = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, fileKey, data);
    const decWithUnwrapped = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, unwrapped, encWithOriginal);

    expect(new Uint8Array(decWithUnwrapped)).toEqual(data);
  });

  it("fails with the wrong private key", async () => {
    const ownerPair = await generateOwnerKeyPair();
    const wrongPair = await generateOwnerKeyPair();
    const fileKey = await generateFileKey();

    const wrapped = await wrapFileKey(fileKey, ownerPair.publicKey);

    await expect(
      unwrapFileKey(wrapped.wrappedKey, wrapped.ephemeralPublicKey, wrapped.wrappedKeyIv, wrongPair.privateKey),
    ).rejects.toThrow();
  });

  it("each wrap produces a different ciphertext (ephemeral key is fresh)", async () => {
    const ownerPair = await generateOwnerKeyPair();
    const fileKey = await generateFileKey();

    const a = await wrapFileKey(fileKey, ownerPair.publicKey);
    const b = await wrapFileKey(fileKey, ownerPair.publicKey);

    expect(a.wrappedKey).not.toBe(b.wrappedKey);
    expect(a.ephemeralPublicKey).not.toBe(b.ephemeralPublicKey);
  });
});
