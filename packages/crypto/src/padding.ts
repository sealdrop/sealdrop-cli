export const PADDING_BLOCK_BYTES = 4096;

const MiB = 1024 * 1024;

const MAXIMUM_BUCKETS = [
  10_000_000,    // 10 MB
  50_000_000,    // 50 MB
  100_000_000,   // 100 MB
  500_000_000,   // 500 MB
  1_073_741_824, // 1 GiB
] as const;

export function paddedLength(originalLength: number): number {
  if (originalLength === 0) return 0;
  const remainder = originalLength % PADDING_BLOCK_BYTES;
  if (remainder === 0) return originalLength;
  return originalLength + (PADDING_BLOCK_BYTES - remainder);
}

export function padToBlock(data: ArrayBuffer): ArrayBuffer {
  const len = data.byteLength;
  const target = paddedLength(len);
  if (target === len) return data;
  const padded = new Uint8Array(target);
  padded.set(new Uint8Array(data), 0);
  crypto.getRandomValues(padded.subarray(len));
  return padded.buffer as ArrayBuffer;
}

export function unpad(padded: ArrayBuffer, originalLength: number): ArrayBuffer {
  if (originalLength === 0) return new ArrayBuffer(0);
  return padded.slice(0, originalLength);
}

/** Round file size up to the next MiB boundary (minimum 1 MiB). */
export function enhancedPaddedSize(fileSize: number): number {
  if (fileSize <= 0) return MiB;
  return Math.ceil(fileSize / MiB) * MiB;
}

/**
 * Round file size up to the smallest bucket in [10MB, 50MB, 100MB, 500MB, 1GiB].
 * Files larger than 1 GiB return the file size unchanged (no bucket applies).
 */
export function maximumPaddedSize(fileSize: number): number {
  for (const bucket of MAXIMUM_BUCKETS) {
    if (fileSize <= bucket) return bucket;
  }
  return fileSize;
}

/** Fill a Uint8Array with cryptographically random bytes, respecting the 65,536-byte getRandomValues limit. */
export function fillRandom(buf: Uint8Array<ArrayBuffer>): void {
  const MAX = 65536;
  for (let offset = 0; offset < buf.length; offset += MAX) {
    crypto.getRandomValues(buf.subarray(offset, Math.min(offset + MAX, buf.length)));
  }
}

/** Pad data to exactly targetSize bytes with random fill. Returns data unchanged if already >= targetSize. */
export function padToSize(data: ArrayBuffer, targetSize: number): ArrayBuffer {
  const len = data.byteLength;
  if (len >= targetSize) return data;
  const out = new Uint8Array(targetSize);
  out.set(new Uint8Array(data), 0);
  fillRandom(out.subarray(len));
  return out.buffer as ArrayBuffer;
}