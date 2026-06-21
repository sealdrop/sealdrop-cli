import { describe, it, expect } from "vitest";
import {
  encryptHandoffUrl,
  decryptHandoffUrl,
  formatHandoffCode,
  parseHandoffCode,
} from "./handoff.js";

describe("parseHandoffCode", () => {
  it("parses spaced format", () => {
    const result = parseHandoffCode("A7KP2M 482 913 774");
    expect(result).toEqual({ handoffId: "A7KP2M", secret: "482913774" });
  });

  it("parses stripped format", () => {
    const result = parseHandoffCode("A7KP2M482913774");
    expect(result).toEqual({ handoffId: "A7KP2M", secret: "482913774" });
  });

  it("is case-insensitive", () => {
    const result = parseHandoffCode("a7kp2m 482 913 774");
    expect(result).toEqual({ handoffId: "A7KP2M", secret: "482913774" });
  });

  it("returns null for wrong length", () => {
    expect(parseHandoffCode("A7KP 482 913")).toBeNull();
  });

  it("returns null if secret contains letters", () => {
    expect(parseHandoffCode("A7KP2M 482 913 77X")).toBeNull();
  });
});

describe("formatHandoffCode", () => {
  it("formats correctly", () => {
    expect(formatHandoffCode("A7KP2M", "482913774")).toBe("A7KP2M 482 913 774");
  });
});

describe("encryptHandoffUrl / decryptHandoffUrl", () => {
  it("round-trips a plain send URL", async () => {
    const url = "https://sealdrop.io/s/abc123#key=somebase64urlkey";
    const result = await encryptHandoffUrl(url);
    expect(result.handoffId).toHaveLength(6);
    expect(result.displayCode).toMatch(/^[A-Z2-9]{6} \d{3} \d{3} \d{3}$/);

    const { secret } = parseHandoffCode(result.displayCode)!;
    const decrypted = await decryptHandoffUrl(secret, {
      encryptedPayload: result.encryptedPayload,
      payloadIv: result.payloadIv,
      kdfSalt: result.kdfSalt,
      kdfIterations: result.kdfIterations,
    });
    expect(decrypted).toBe(url);
  });

  it("preserves URL fragment", async () => {
    const url = "https://sealdrop.io/s/xyz#key=AAAA:BBBB:CCCC&ac=1";
    const result = await encryptHandoffUrl(url);
    const { secret } = parseHandoffCode(result.displayCode)!;
    const decrypted = await decryptHandoffUrl(secret, {
      encryptedPayload: result.encryptedPayload,
      payloadIv: result.payloadIv,
      kdfSalt: result.kdfSalt,
      kdfIterations: result.kdfIterations,
    });
    expect(decrypted).toContain("#key=AAAA:BBBB:CCCC&ac=1");
  });

  it("fails decryption with wrong secret", async () => {
    const url = "https://sealdrop.io/s/abc123#key=somekey";
    const result = await encryptHandoffUrl(url);
    await expect(
      decryptHandoffUrl("000000000", {
        encryptedPayload: result.encryptedPayload,
        payloadIv: result.payloadIv,
        kdfSalt: result.kdfSalt,
        kdfIterations: result.kdfIterations,
      }),
    ).rejects.toThrow();
  });

  it("encrypted payload does not contain plaintext URL", async () => {
    const url = "https://sealdrop.io/s/secretfile#key=verysecretkey";
    const result = await encryptHandoffUrl(url);
    expect(result.encryptedPayload).not.toContain("secretfile");
    expect(result.encryptedPayload).not.toContain("verysecretkey");
    expect(result.payloadIv).not.toContain("secretfile");
    expect(result.kdfSalt).not.toContain("secretfile");
  });
});
