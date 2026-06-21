import { describe, it, expect } from "vitest";
import {
  CHUNK_SIZE_BYTES,
  encryptChunk,
  decryptChunk,
  chunkFile,
  encryptStream,
  decryptStream,
  encryptedChunkLength,
} from "./streaming.js";
import { generateFileKey, generateIV, encryptMetadata, decryptMetadata } from "./symmetric.js";
import { PADDING_BLOCK_BYTES, unpad, paddedLength, padToBlock, enhancedPaddedSize, padToSize, fillRandom } from "./padding.js";

describe("CHUNK_SIZE_BYTES", () => {
  it("is 10 MiB", () => {
    expect(CHUNK_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("encryptedChunkLength", () => {
  it("adds 16 bytes for the GCM tag", () => {
    expect(encryptedChunkLength(0)).toBe(16);
    expect(encryptedChunkLength(100)).toBe(116);
    expect(encryptedChunkLength(65536)).toBe(65552);
  });
});

describe("encryptChunk / decryptChunk", () => {
  it("round-trips a chunk", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = crypto.getRandomValues(new Uint8Array(1000));

    const encrypted = await encryptChunk(plaintext.buffer as ArrayBuffer, key, baseIv, 0);
    const decrypted = await decryptChunk(encrypted, key, baseIv, 0);

    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it("produces different ciphertext for same plaintext at different indices", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = new Uint8Array(64).fill(0x42);

    const enc0 = await encryptChunk(plaintext.buffer as ArrayBuffer, key, baseIv, 0);
    const enc1 = await encryptChunk(plaintext.buffer as ArrayBuffer, key, baseIv, 1);

    expect(new Uint8Array(enc0)).not.toEqual(new Uint8Array(enc1));
  });

  it("rejects decrypt with wrong index", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = new Uint8Array(64).fill(0x42);

    const encrypted = await encryptChunk(plaintext.buffer as ArrayBuffer, key, baseIv, 0);
    await expect(decryptChunk(encrypted, key, baseIv, 1)).rejects.toThrow();
  });

  it("rejects decrypt with wrong key", async () => {
    const key1 = await generateFileKey();
    const key2 = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = new Uint8Array(64).fill(0x42);

    const encrypted = await encryptChunk(plaintext.buffer as ArrayBuffer, key1, baseIv, 0);
    await expect(decryptChunk(encrypted, key2, baseIv, 0)).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = new Uint8Array(64).fill(0x42);

    const encrypted = await encryptChunk(plaintext.buffer as ArrayBuffer, key, baseIv, 0);
    const tampered = encrypted.slice(0, encrypted.byteLength - 1);
    await expect(decryptChunk(tampered, key, baseIv, 0)).rejects.toThrow();
  });

  it("handles empty chunk", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const plaintext = new ArrayBuffer(0);

    const encrypted = await encryptChunk(plaintext, key, baseIv, 0);
    const decrypted = await decryptChunk(encrypted, key, baseIv, 0);

    expect(decrypted.byteLength).toBe(0);
  });
});

describe("chunkFile", () => {
  it("splits a small file into one chunk", () => {
    const data = new Uint8Array(100);
    const chunks = chunkFile(data.buffer as ArrayBuffer);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(100);
    expect(chunks[0]!.index).toBe(0);
  });

  it("splits a file larger than chunk size into multiple chunks", () => {
    const data = new Uint8Array(CHUNK_SIZE_BYTES + 1);
    const chunks = chunkFile(data.buffer as ArrayBuffer);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.byteLength).toBe(CHUNK_SIZE_BYTES);
    expect(chunks[1]!.byteLength).toBe(1);
  });

  it("splits exact multiples correctly", () => {
    const data = new Uint8Array(CHUNK_SIZE_BYTES * 3);
    const chunks = chunkFile(data.buffer as ArrayBuffer);
    expect(chunks).toHaveLength(3);
    chunks.forEach((c, i) => {
      expect(c.byteLength).toBe(CHUNK_SIZE_BYTES);
      expect(c.index).toBe(i);
    });
  });

  it("handles empty file", () => {
    const chunks = chunkFile(new ArrayBuffer(0));
    expect(chunks).toHaveLength(0);
  });

  it("pads last chunk to block boundary when pad=true", () => {
    const data = new Uint8Array(100);
    const chunks = chunkFile(data.buffer as ArrayBuffer, true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(PADDING_BLOCK_BYTES);
  });

  it("does not pad intermediate chunks", () => {
    const data = new Uint8Array(CHUNK_SIZE_BYTES + 100);
    const chunks = chunkFile(data.buffer as ArrayBuffer, true);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.byteLength).toBe(CHUNK_SIZE_BYTES);
    expect(chunks[1]!.byteLength).toBe(PADDING_BLOCK_BYTES);
  });

  it("does not pad when pad=false", () => {
    const data = new Uint8Array(100);
    const chunks = chunkFile(data.buffer as ArrayBuffer, false);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(100);
  });
});

async function arrayBufferToStream(buf: ArrayBuffer): Promise<ReadableStream<Uint8Array>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
}

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result.buffer as ArrayBuffer;
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.byteLength).toBe(expected.byteLength);
  const step = expected.byteLength > 65536 ? 4096 : 1;
  for (let i = 0; i < expected.byteLength; i += step) {
    if (actual[i] !== expected[i]) {
      throw new Error(`byte mismatch at ${i}: ${actual[i]} !== ${expected[i]}`);
    }
  }
  const last = expected.byteLength - 1;
  if (last >= 0 && actual[last] !== expected[last]) {
    throw new Error(`byte mismatch at ${last}: ${actual[last]} !== ${expected[last]}`);
  }
}

describe("encryptStream / decryptStream", () => {

  it("round-trips a small file through streams", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const original = crypto.getRandomValues(new Uint8Array(1000));

    const inputStream = await arrayBufferToStream(original.buffer as ArrayBuffer);
    const encryptedStream = encryptStream(inputStream, key, baseIv);
    const encrypted = await streamToArrayBuffer(encryptedStream);

    const decryptedStream = decryptStream(
      await arrayBufferToStream(encrypted),
      key,
      baseIv,
      1000,
    );
    const decrypted = await streamToArrayBuffer(decryptedStream);

    expectBytesEqual(new Uint8Array(decrypted), original);
  });

  it("round-trips a file larger than chunk size", { timeout: 300_000 }, async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const original = new Uint8Array(CHUNK_SIZE_BYTES + 500);
    for (let i = 0; i < original.length; i++) original[i] = i & 0xff;

    const inputStream = await arrayBufferToStream(original.buffer as ArrayBuffer);
    const encryptedStream = encryptStream(inputStream, key, baseIv);
    const encrypted = await streamToArrayBuffer(encryptedStream);

    const decryptedStream = decryptStream(
      await arrayBufferToStream(encrypted),
      key,
      baseIv,
      original.byteLength,
    );
    const decrypted = await streamToArrayBuffer(decryptedStream);

    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("round-trips an empty file", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();

    const inputStream = await arrayBufferToStream(new ArrayBuffer(0));
    const encryptedStream = encryptStream(inputStream, key, baseIv);
    const encrypted = await streamToArrayBuffer(encryptedStream);

    const decryptedStream = decryptStream(
      await arrayBufferToStream(encrypted),
      key,
      baseIv,
      0,
    );
    const decrypted = await streamToArrayBuffer(decryptedStream);

    expect(decrypted.byteLength).toBe(0);
  });

  it("rejects tampered encrypted stream", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const original = new Uint8Array(100).fill(0xab);

    const inputStream = await arrayBufferToStream(original.buffer as ArrayBuffer);
    const encryptedStream = encryptStream(inputStream, key, baseIv);
    const encrypted = await streamToArrayBuffer(encryptedStream);

    const tampered = new Uint8Array(encrypted);
    tampered[10]! ^= 0xff;

    const decryptedStream = decryptStream(
      await arrayBufferToStream(tampered.buffer as ArrayBuffer),
      key,
      baseIv,
      100,
    );

    let threw = false;
    try {
      await streamToArrayBuffer(decryptedStream);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects a stream that ends before the expected plaintext length", async () => {
    const key = await generateFileKey();
    const baseIv = generateIV();
    const original = new Uint8Array(CHUNK_SIZE_BYTES + 500);
    for (let i = 0; i < original.length; i++) original[i] = i & 0xff;

    const inputStream = await arrayBufferToStream(original.buffer as ArrayBuffer);
    const encryptedStream = encryptStream(inputStream, key, baseIv);
    const encrypted = await streamToArrayBuffer(encryptedStream);

    // Truncate to only the first encrypted chunk, simulating a server
    // that stops sending data partway through (e.g. a missing part).
    const truncated = encrypted.slice(0, encryptedChunkLength(CHUNK_SIZE_BYTES));

    const decryptedStream = decryptStream(
      await arrayBufferToStream(truncated),
      key,
      baseIv,
      original.byteLength,
    );

    let threw = false;
    try {
      await streamToArrayBuffer(decryptedStream);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// Mirrors the SendFilePage.tsx fallback logic for decryptLength.
function computePaddedTotalLength(sizeBytes: number, chunkCount: number): number {
  if (chunkCount === 0) return 0;
  const lastChunkOrigSize = sizeBytes - (chunkCount - 1) * CHUNK_SIZE_BYTES;
  return (chunkCount - 1) * CHUNK_SIZE_BYTES + paddedLength(lastChunkOrigSize);
}

describe("M3 padding round-trips", () => {
  // Simulates the full upload → download cycle for Enhanced padding and the
  // Standard backward-compat path, mirroring the logic in SendPage.tsx and
  // SendFilePage.tsx.

  it("Enhanced padding: recovers original file using paddedSizeBytes from metadata", async () => {
    const originalSize = 500_000; // 500 KB → Enhanced target = 1 MiB
    // Use sequential fill — getRandomValues is limited to 65,536 bytes per call.
    const original = new Uint8Array(originalSize).map((_, i) => i & 0xff);
    const key = await generateFileKey();
    const baseIv = generateIV();
    const metaIv = generateIV();

    const targetSize = enhancedPaddedSize(originalSize); // 1 MiB
    const realChunkCount = Math.ceil(originalSize / CHUNK_SIZE_BYTES); // 1
    const totalChunkCount = Math.ceil(targetSize / CHUNK_SIZE_BYTES); // 1

    // Encrypt metadata with paddedSizeBytes (M3 upload path)
    const encMeta = await encryptMetadata(
      {
        filename: "test.bin",
        mimeType: "application/octet-stream",
        sizeBytes: originalSize,
        chunkCount: totalChunkCount,
        padded: true,
        paddedSizeBytes: targetSize,
      },
      key,
      metaIv,
    );

    // Encrypt chunks with random fill (M3 upload loop)
    const encryptedChunks: ArrayBuffer[] = [];
    for (let i = 0; i < totalChunkCount; i++) {
      const thisChunkSize = Math.min(CHUNK_SIZE_BYTES, targetSize - i * CHUNK_SIZE_BYTES);
      let chunkData: ArrayBuffer;
      if (i < realChunkCount) {
        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, originalSize);
        chunkData = padToSize(original.slice(start, end).buffer as ArrayBuffer, thisChunkSize);
      } else {
        const buf = new Uint8Array(thisChunkSize);
        crypto.getRandomValues(buf);
        chunkData = buf.buffer as ArrayBuffer;
      }
      encryptedChunks.push(await encryptChunk(chunkData, key, baseIv, i));
    }

    // Decrypt metadata — paddedSizeBytes must survive the round-trip
    const meta = await decryptMetadata(encMeta, key, metaIv);
    expect(meta.paddedSizeBytes).toBe(targetSize);

    // decryptLength uses paddedSizeBytes (M3 decrypt path in SendFilePage.tsx)
    const decryptLength = meta.paddedSizeBytes
      ?? (meta.padded ? computePaddedTotalLength(meta.sizeBytes, meta.chunkCount ?? 1) : meta.sizeBytes);
    expect(decryptLength).toBe(targetSize);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of encryptedChunks) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      },
    });
    const fullBuffer = await streamToArrayBuffer(decryptStream(stream, key, baseIv, decryptLength));

    // Slice to original size — same as SendFilePage.tsx blob.slice(0, meta.sizeBytes)
    expect(new Uint8Array(fullBuffer.slice(0, meta.sizeBytes))).toEqual(original);
  });

  it("Standard backward-compat: decrypts legacy padded files without paddedSizeBytes", async () => {
    const originalSize = 100_000; // 100 KB — Standard padding: last chunk to next 4 KB
    const original = new Uint8Array(originalSize).map((_, i) => i & 0xff);
    const key = await generateFileKey();
    const baseIv = generateIV();
    const metaIv = generateIV();

    const realChunkCount = Math.ceil(originalSize / CHUNK_SIZE_BYTES); // 1

    // Encrypt metadata — Standard style: padded: true, no paddedSizeBytes
    const encMeta = await encryptMetadata(
      {
        filename: "test.bin",
        mimeType: "application/octet-stream",
        sizeBytes: originalSize,
        chunkCount: realChunkCount,
        padded: true,
      },
      key,
      metaIv,
    );

    // Encrypt chunks with Standard padding (padToBlock on last chunk)
    const encryptedChunks: ArrayBuffer[] = [];
    for (let i = 0; i < realChunkCount; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, originalSize);
      let chunkData = original.slice(start, end).buffer as ArrayBuffer;
      if (i === realChunkCount - 1) chunkData = padToBlock(chunkData);
      encryptedChunks.push(await encryptChunk(chunkData, key, baseIv, i));
    }

    // Decrypt metadata — no paddedSizeBytes on legacy files
    const meta = await decryptMetadata(encMeta, key, metaIv);
    expect(meta.paddedSizeBytes).toBeUndefined();

    // Fallback: use computePaddedTotalLength (backward-compat path)
    const count = meta.chunkCount ?? 1;
    const decryptLength = meta.paddedSizeBytes
      ?? (meta.padded ? computePaddedTotalLength(meta.sizeBytes, count) : meta.sizeBytes);
    expect(decryptLength).toBe(paddedLength(originalSize));

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of encryptedChunks) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      },
    });
    const fullBuffer = await streamToArrayBuffer(decryptStream(stream, key, baseIv, decryptLength));

    expect(new Uint8Array(fullBuffer.slice(0, meta.sizeBytes))).toEqual(original);
  });

  it("Enhanced padding multi-chunk: extra random chunk after last real chunk", async () => {
    // File is just over one real chunk's capacity; Enhanced target falls in next MiB.
    // Tests that a pure-random padding chunk decrypts and gets stripped correctly.
    const originalSize = 1500; // small — fits in 1 real chunk; target = 1 MiB (1 chunk only)
    // Construct a two-real-chunk scenario by using a tiny fake CHUNK_SIZE via direct encryptChunk.
    // File: 1500 bytes. We fake two "real" chunks of 1000 + 500, plus one 500-byte random chunk.
    const fakeChunkSize = 1000; // not CHUNK_SIZE_BYTES — test the per-chunk math directly
    const original = crypto.getRandomValues(new Uint8Array(originalSize));
    const key = await generateFileKey();
    const baseIv = generateIV();

    const targetSize = 3000; // pretend paddedSizeBytes = 3000 (3 chunks × 1000)
    const realChunkCount = Math.ceil(originalSize / fakeChunkSize); // 2 (1000 + 500)
    const totalChunkCount = Math.ceil(targetSize / fakeChunkSize); // 3

    const encryptedChunks: ArrayBuffer[] = [];
    for (let i = 0; i < totalChunkCount; i++) {
      const thisChunkSize = Math.min(fakeChunkSize, targetSize - i * fakeChunkSize);
      let chunkData: ArrayBuffer;
      if (i < realChunkCount) {
        const start = i * fakeChunkSize;
        const end = Math.min(start + fakeChunkSize, originalSize);
        chunkData = padToSize(original.slice(start, end).buffer as ArrayBuffer, thisChunkSize);
      } else {
        const buf = new Uint8Array(thisChunkSize);
        crypto.getRandomValues(buf);
        chunkData = buf.buffer as ArrayBuffer;
      }
      encryptedChunks.push(await encryptChunk(chunkData, key, baseIv, i));
    }

    // Decrypt all 3 chunks with decryptLength = targetSize (1000+1000+1000 = 3000)
    // We test via decryptChunk directly since fakeChunkSize ≠ CHUNK_SIZE_BYTES.
    const decryptedChunks: Uint8Array[] = [];
    for (let i = 0; i < totalChunkCount; i++) {
      const raw = await decryptChunk(encryptedChunks[i]!, key, baseIv, i);
      decryptedChunks.push(new Uint8Array(raw));
    }

    // Reassemble and slice to original size
    const totalLen = decryptedChunks.reduce((s, c) => s + c.byteLength, 0);
    const full = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of decryptedChunks) { full.set(c, offset); offset += c.byteLength; }

    expect(new Uint8Array(full.slice(0, originalSize))).toEqual(original);
  });
});
