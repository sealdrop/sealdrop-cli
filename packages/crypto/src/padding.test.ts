import { describe, it, expect } from "vitest";
import {
  PADDING_BLOCK_BYTES,
  padToBlock,
  unpad,
  paddedLength,
  enhancedPaddedSize,
  maximumPaddedSize,
  padToSize,
  fillRandom,
} from "./padding.js";

describe("PADDING_BLOCK_BYTES", () => {
  it("is 4096 bytes", () => {
    expect(PADDING_BLOCK_BYTES).toBe(4096);
  });
});

describe("paddedLength", () => {
  it("returns exact block size for multiples", () => {
    expect(paddedLength(4096)).toBe(4096);
    expect(paddedLength(8192)).toBe(8192);
    expect(paddedLength(0)).toBe(0);
  });

  it("rounds up to next block for non-multiples", () => {
    expect(paddedLength(1)).toBe(4096);
    expect(paddedLength(4095)).toBe(4096);
    expect(paddedLength(4097)).toBe(8192);
  });
});

describe("padToBlock / unpad", () => {
  it("pads data to block boundary", () => {
    const data = new Uint8Array(100).fill(0xab);
    const padded = padToBlock(data.buffer as ArrayBuffer);
    expect(padded.byteLength).toBe(4096);
    expect(new Uint8Array(padded.slice(0, 100))).toEqual(data);
  });

  it("does not pad data already at block boundary", () => {
    const data = new Uint8Array(4096).fill(0xab);
    const padded = padToBlock(data.buffer as ArrayBuffer);
    expect(padded.byteLength).toBe(4096);
  });

  it("unpad restores original data", () => {
    const data = new Uint8Array(100).fill(0xab);
    const padded = padToBlock(data.buffer as ArrayBuffer);
    const unpadded = unpad(padded, 100);
    expect(new Uint8Array(unpadded)).toEqual(data);
  });

  it("unpad with exact size returns same buffer", () => {
    const data = new Uint8Array(4096).fill(0xab);
    const unpadded = unpad(data.buffer as ArrayBuffer, 4096);
    expect(unpadded.byteLength).toBe(4096);
  });

  it("unpad with zero size returns empty", () => {
    const data = new Uint8Array(4096).fill(0xab);
    const unpadded = unpad(data.buffer as ArrayBuffer, 0);
    expect(unpadded.byteLength).toBe(0);
  });

  it("padding bytes are random (not zero)", () => {
    const data = new Uint8Array(1).fill(0x42);
    const padded = padToBlock(data.buffer as ArrayBuffer);
    const padding = new Uint8Array(padded.slice(1));
    const allZero = padding.every((b) => b === 0);
    expect(allZero).toBe(false);
  });

  it("handles empty buffer", () => {
    const padded = padToBlock(new ArrayBuffer(0));
    expect(padded.byteLength).toBe(0);
  });
});

describe("enhancedPaddedSize", () => {
  it("rounds up to next MiB", () => {
    expect(enhancedPaddedSize(1)).toBe(1024 * 1024);
    expect(enhancedPaddedSize(1024 * 1024)).toBe(1024 * 1024);
    expect(enhancedPaddedSize(1024 * 1024 + 1)).toBe(2 * 1024 * 1024);
    expect(enhancedPaddedSize(3 * 1024 * 1024)).toBe(3 * 1024 * 1024);
  });

  it("returns 1 MiB for zero or negative input", () => {
    expect(enhancedPaddedSize(0)).toBe(1024 * 1024);
    expect(enhancedPaddedSize(-1)).toBe(1024 * 1024);
  });
});

describe("maximumPaddedSize", () => {
  it("maps to correct bucket", () => {
    expect(maximumPaddedSize(1)).toBe(10_000_000);
    expect(maximumPaddedSize(10_000_000)).toBe(10_000_000);
    expect(maximumPaddedSize(10_000_001)).toBe(50_000_000);
    expect(maximumPaddedSize(50_000_000)).toBe(50_000_000);
    expect(maximumPaddedSize(50_000_001)).toBe(100_000_000);
    expect(maximumPaddedSize(100_000_001)).toBe(500_000_000);
    expect(maximumPaddedSize(500_000_001)).toBe(1_073_741_824);
    expect(maximumPaddedSize(1_073_741_824)).toBe(1_073_741_824);
  });

  it("returns file size unchanged when larger than all buckets", () => {
    const big = 2_000_000_000;
    expect(maximumPaddedSize(big)).toBe(big);
  });
});

describe("padToSize", () => {
  it("pads data to target size with random fill", () => {
    const data = new Uint8Array(100).fill(0xab);
    const padded = new Uint8Array(padToSize(data.buffer as ArrayBuffer, 500));
    expect(padded.byteLength).toBe(500);
    expect(padded.slice(0, 100).every(b => b === 0xab)).toBe(true);
  });

  it("returns original buffer when already at target size", () => {
    const data = new Uint8Array(500).fill(0xcc);
    const result = padToSize(data.buffer as ArrayBuffer, 500);
    expect(result.byteLength).toBe(500);
  });

  it("returns original buffer when larger than target size", () => {
    const data = new Uint8Array(600).fill(0xcc);
    const result = padToSize(data.buffer as ArrayBuffer, 500);
    expect(result).toBe(data.buffer);
  });

  it("padding bytes are random (not zero)", () => {
    const data = new Uint8Array(1).fill(0x42);
    const padded = new Uint8Array(padToSize(data.buffer as ArrayBuffer, 1000));
    const allZero = padded.slice(1).every(b => b === 0);
    expect(allZero).toBe(false);
  });

  it("handles padding larger than 65536 bytes via chunked getRandomValues", () => {
    const data = new Uint8Array(100).fill(0xab);
    const padded = new Uint8Array(padToSize(data.buffer as ArrayBuffer, 200_000));
    expect(padded.byteLength).toBe(200_000);
    expect(padded.slice(0, 100).every(b => b === 0xab)).toBe(true);
    expect(padded.slice(100).some(b => b !== 0)).toBe(true);
  });
});

describe("fillRandom", () => {
  it("fills a buffer smaller than 65536 bytes", () => {
    const buf = new Uint8Array(1000);
    fillRandom(buf);
    expect(buf.some(b => b !== 0)).toBe(true);
  });

  it("fills a buffer larger than 65536 bytes", () => {
    const buf = new Uint8Array(200_000);
    fillRandom(buf);
    expect(buf.some(b => b !== 0)).toBe(true);
  });
});