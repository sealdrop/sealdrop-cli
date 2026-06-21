import { describe, it, expect } from "vitest";
import { SendInitSchema, ReceiveInitSchema, ReceiveFileInitSchema, ProWaitlistSchema } from "./schemas.js";
import { MAX_FILE_SIZE_BYTES } from "./limits.js";

const validSendInit = {
  size_bytes: 1024,
  expiry_preset: "open-once",
  encrypted_metadata: "abc123",
  metadata_iv: "iv1",
  file_iv: "iv2",
  chunk_count: 1,
  want_delete_link: false,
};

describe("SendInitSchema", () => {
  it("accepts valid input", () => {
    expect(SendInitSchema.safeParse(validSendInit).success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(SendInitSchema.safeParse({}).success).toBe(false);
    expect(SendInitSchema.safeParse({ size_bytes: 100 }).success).toBe(false);
  });

  it("rejects invalid expiry preset", () => {
    expect(SendInitSchema.safeParse({ ...validSendInit, expiry_preset: "invalid" }).success).toBe(false);
  });

  it("rejects file size > MAX_FILE_SIZE_BYTES", () => {
    expect(SendInitSchema.safeParse({ ...validSendInit, size_bytes: MAX_FILE_SIZE_BYTES + 1 }).success).toBe(false);
  });

  it("rejects zero or negative size", () => {
    expect(SendInitSchema.safeParse({ ...validSendInit, size_bytes: 0 }).success).toBe(false);
    expect(SendInitSchema.safeParse({ ...validSendInit, size_bytes: -1 }).success).toBe(false);
  });

  it("rejects empty encrypted_metadata", () => {
    expect(SendInitSchema.safeParse({ ...validSendInit, encrypted_metadata: "" }).success).toBe(false);
  });
});

const validReceiveInit = { public_key: "pubkey123", expiry_preset: "one-file" };

describe("ReceiveInitSchema", () => {
  it("accepts valid input", () => {
    expect(ReceiveInitSchema.safeParse(validReceiveInit).success).toBe(true);
  });

  it("rejects invalid expiry preset", () => {
    expect(ReceiveInitSchema.safeParse({ ...validReceiveInit, expiry_preset: "nope" }).success).toBe(false);
  });

  it("rejects empty public_key", () => {
    expect(ReceiveInitSchema.safeParse({ ...validReceiveInit, public_key: "" }).success).toBe(false);
  });
});

const validReceiveFileInit = {
  size_bytes: 512,
  encrypted_metadata: "meta",
  metadata_iv: "iv1",
  file_iv: "iv2",
  chunk_count: 1,
  wrapped_file_key: "wfk",
  ephemeral_public_key: "epk",
  wrapped_key_iv: "wkiv",
};

describe("ReceiveFileInitSchema", () => {
  it("accepts valid input", () => {
    expect(ReceiveFileInitSchema.safeParse(validReceiveFileInit).success).toBe(true);
  });

  it("rejects missing wrapped_file_key", () => {
    const { wrapped_file_key: _, ...rest } = validReceiveFileInit;
    expect(ReceiveFileInitSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects file size > MAX_FILE_SIZE_BYTES", () => {
    expect(ReceiveFileInitSchema.safeParse({ ...validReceiveFileInit, size_bytes: MAX_FILE_SIZE_BYTES + 1 }).success).toBe(false);
  });
});

describe("ProWaitlistSchema", () => {
  const valid = {
    email: "ucetni@example.cz",
    role: "accountant",
    frequency: "monthly",
    language: "cs",
    source: "pro-page",
    contact_consent: true,
  };

  it("accepts a consented professional lead", () => {
    expect(ProWaitlistSchema.safeParse(valid).success).toBe(true);
    expect(ProWaitlistSchema.safeParse({ ...valid, language: "mk" }).success).toBe(true);
  });

  it("requires explicit consent", () => {
    expect(ProWaitlistSchema.safeParse({ ...valid, contact_consent: false }).success).toBe(false);
    expect(ProWaitlistSchema.safeParse({ ...valid, contact_consent: undefined }).success).toBe(false);
  });

  it("rejects invalid email and campaign values", () => {
    expect(ProWaitlistSchema.safeParse({ ...valid, email: "not-email" }).success).toBe(false);
    expect(ProWaitlistSchema.safeParse({ ...valid, source: "personal-tracker" }).success).toBe(false);
  });
});
