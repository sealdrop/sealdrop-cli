import { describe, it, expect } from "vitest";
import { encryptMetadata, decryptMetadata, generateFileKey, generateIV } from "./symmetric.js";
import type { FileMetadata } from "./symmetric.js";

describe("sender note in metadata", () => {
  it("round-trips metadata with a note", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const meta: FileMetadata = {
      filename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42000,
      note: "Here is the quarterly report you asked for.",
    };

    const encrypted = await encryptMetadata(meta, key, iv);
    const decrypted = await decryptMetadata(encrypted, key, iv);

    expect(decrypted.filename).toBe("doc.pdf");
    expect(decrypted.note).toBe("Here is the quarterly report you asked for.");
  });

  it("round-trips metadata without a note", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const meta: FileMetadata = {
      filename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42000,
    };

    const encrypted = await encryptMetadata(meta, key, iv);
    const decrypted = await decryptMetadata(encrypted, key, iv);

    expect(decrypted.filename).toBe("doc.pdf");
    expect(decrypted.note).toBeUndefined();
  });

  it("round-trips metadata with an empty note", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const meta: FileMetadata = {
      filename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42000,
      note: "",
    };

    const encrypted = await encryptMetadata(meta, key, iv);
    const decrypted = await decryptMetadata(encrypted, key, iv);

    expect(decrypted.note).toBe("");
  });

  it("encrypted output differs with and without note", async () => {
    const key = await generateFileKey();
    const iv = generateIV();
    const metaWithout: FileMetadata = { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 100 };
    const metaWith: FileMetadata = { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 100, note: "hi" };

    const encWithout = await encryptMetadata(metaWithout, key, iv);
    const encWith = await encryptMetadata(metaWith, key, iv);

    expect(new Uint8Array(encWith)).not.toEqual(new Uint8Array(encWithout));
  });
});