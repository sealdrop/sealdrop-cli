import { describe, it, expect } from "vitest";
import {
  generateFileKey,
  generateIV,
  encryptFile,
  decryptFile,
  encryptMetadata,
  decryptMetadata,
} from "./symmetric.js";
import type { FileMetadata } from "./symmetric.js";

describe("generateIV", () => {
  it("returns a 12-byte Uint8Array", () => {
    const iv = generateIV();
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.byteLength).toBe(12);
  });

  it("generates unique IVs", () => {
    const ivs = new Set(Array.from({ length: 100 }, () => Buffer.from(generateIV()).toString("hex")));
    expect(ivs.size).toBe(100);
  });
});

describe("encryptFile / decryptFile", () => {
  it("round-trips arbitrary bytes", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const original = crypto.getRandomValues(new Uint8Array(1024));

    const encrypted = await encryptFile(original.buffer as ArrayBuffer, key, iv);
    const decrypted = await decryptFile(encrypted, key, iv);

    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("encrypted output differs from plaintext", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const data = new Uint8Array(64).fill(0xab);

    const encrypted = await encryptFile(data.buffer as ArrayBuffer, key, iv);
    expect(new Uint8Array(encrypted)).not.toEqual(data);
  });

  it("rejects decryption with wrong key", async () => {
    const key1 = await generateFileKey();
    const key2 = await generateFileKey();
    const iv = generateIV();
    const data = new Uint8Array(64).fill(1);

    const encrypted = await encryptFile(data.buffer as ArrayBuffer, key1, iv);
    await expect(decryptFile(encrypted, key2, iv)).rejects.toThrow();
  });

  it("rejects decryption with wrong IV", async () => {
    const key = await generateFileKey();
    const iv1 = generateIV();
    const iv2 = generateIV();
    const data = new Uint8Array(64).fill(1);

    const encrypted = await encryptFile(data.buffer as ArrayBuffer, key, iv1);
    await expect(decryptFile(encrypted, key, iv2)).rejects.toThrow();
  });

  it("round-trips an empty file", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const data = new ArrayBuffer(0);

    const encrypted = await encryptFile(data, key, iv);
    const decrypted = await decryptFile(encrypted, key, iv);
    expect(new Uint8Array(decrypted).length).toBe(0);
  });
});

describe("encryptMetadata / decryptMetadata", () => {
  const meta: FileMetadata = { filename: "hello.pdf", mimeType: "application/pdf", sizeBytes: 42000 };

  it("round-trips file metadata", async () => {
    const key = await generateFileKey();
    const iv = generateIV();

    const encrypted = await encryptMetadata(meta, key, iv);
    const decrypted = await decryptMetadata(encrypted, key, iv);

    expect(decrypted).toEqual(meta);
  });

  it("encrypted output is not plaintext JSON", async () => {
    const key = await generateFileKey();
    const iv = generateIV();

    const encrypted = await encryptMetadata(meta, key, iv);
    const raw = new TextDecoder().decode(encrypted);
    expect(raw).not.toContain("hello.pdf");
  });

  it("rejects tampered ciphertext", async () => {
    const key = await generateFileKey();
    const iv = generateIV();

    const encrypted = await encryptMetadata(meta, key, iv);
    const tampered = encrypted.slice(0, encrypted.byteLength - 1);
    await expect(decryptMetadata(tampered, key, iv)).rejects.toThrow();
  });
});
