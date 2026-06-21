import { describe, it, expect } from "vitest";
import {
  resolveSendExpiry, resolveReceiveExpiry,
  SEND_EXPIRY_PRESETS, RECEIVE_EXPIRY_PRESETS,
  DEFAULT_SEND_EXPIRY, DEFAULT_RECEIVE_EXPIRY,
} from "./expiry.js";

describe("SEND_EXPIRY_PRESETS", () => {
  it("contains 5 presets", () => expect(SEND_EXPIRY_PRESETS).toHaveLength(5));
  it("default is open-once", () => expect(DEFAULT_SEND_EXPIRY).toBe("open-once"));
});

describe("RECEIVE_EXPIRY_PRESETS", () => {
  it("contains 5 presets", () => expect(RECEIVE_EXPIRY_PRESETS).toHaveLength(5));
  it("default is one-file", () => expect(DEFAULT_RECEIVE_EXPIRY).toBe("one-file"));
});

describe("resolveSendExpiry", () => {
  const now = new Date("2026-06-07T12:00:00Z");

  it("open-once → remaining_downloads=1, expires in 7 days", () => {
    const r = resolveSendExpiry("open-once", now);
    expect(r.remainingDownloads).toBe(1);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("1h → expires in 1 hour, unlimited download count", () => {
    const r = resolveSendExpiry("1h", now);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
    expect(r.remainingDownloads).toBe(-1);
  });

  it("today → expires at end of day", () => {
    const r = resolveSendExpiry("today", now);
    expect(r.expiresAt.getHours()).toBe(23);
    expect(r.expiresAt.getMinutes()).toBe(59);
  });

  it("3d → expires in 3 days", () => {
    const r = resolveSendExpiry("3d", now);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  });

  it("7d → expires in 7 days", () => {
    const r = resolveSendExpiry("7d", now);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("all presets produce a future expiresAt", () => {
    for (const preset of SEND_EXPIRY_PRESETS) {
      const r = resolveSendExpiry(preset, now);
      expect(r.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("resolveReceiveExpiry", () => {
  const now = new Date("2026-06-07T12:00:00Z");

  it("one-file → maxFiles=1, expires today", () => {
    const r = resolveReceiveExpiry("one-file", now);
    expect(r.maxFiles).toBe(1);
    expect(r.expiresAt.getHours()).toBe(23);
  });

  it("3-files → maxFiles=3", () => {
    const r = resolveReceiveExpiry("3-files", now);
    expect(r.maxFiles).toBe(3);
  });

  it("7d → expires in 7 days", () => {
    const r = resolveReceiveExpiry("7d", now);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("1h → expires in 1 hour", () => {
    const r = resolveReceiveExpiry("1h", now);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it("all presets produce a future expiresAt", () => {
    for (const preset of RECEIVE_EXPIRY_PRESETS) {
      const r = resolveReceiveExpiry(preset, now);
      expect(r.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
