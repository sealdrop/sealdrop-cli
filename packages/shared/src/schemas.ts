import { z } from "zod";
import { MAX_FILE_SIZE_BYTES, CHUNK_SIZE_BYTES } from "./limits.js";
import { SEND_EXPIRY_PRESETS, RECEIVE_EXPIRY_PRESETS } from "./expiry.js";

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/, "must be base64url");

export const SendInitSchema = z.object({
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  expiry_preset: z.enum(SEND_EXPIRY_PRESETS),
  encrypted_metadata: z.string().min(1),
  metadata_iv: z.string().min(1),
  file_iv: z.string().min(1),
  chunk_count: z.number().int().positive(),
  want_delete_link: z.boolean().optional().default(false),
  turnstile_token: z.string().optional(),
});

export const ReceiveInitSchema = z.object({
  public_key: z.string().min(1),
  expiry_preset: z.enum(RECEIVE_EXPIRY_PRESETS),
  turnstile_token: z.string().optional(),
});

export const ReceiveFileInitSchema = z.object({
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  encrypted_metadata: z.string().min(1),
  metadata_iv: z.string().min(1),
  file_iv: z.string().min(1),
  chunk_count: z.number().int().positive().optional().default(1),
  wrapped_file_key: z.string().min(1),
  ephemeral_public_key: z.string().min(1),
  wrapped_key_iv: z.string().min(1),
});

export const HANDOFF_KDF_ITERATIONS = 100_000;

export const CreateOpenLinkSchema = z.object({
  encrypted_payload: base64url.min(20).max(4096),
  payload_iv: base64url.length(16, "must be 12 bytes (16 base64url chars)"),
  kdf_salt: base64url.length(22, "must be 16 bytes (22 base64url chars)"),
  kdf_iterations: z.literal(HANDOFF_KDF_ITERATIONS),
});

export const CliUploadAuthorizationSchema = z.object({
  request_nonce: base64url.length(43, "must be 32 bytes"),
  secret_proof: base64url.length(43, "must be a SHA-256 digest"),
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  expiry_preset: z.enum(SEND_EXPIRY_PRESETS),
  turnstile_token: z.string().optional(),
});

export const PRO_WAITLIST_ROLES = ["accountant", "tax-advisor", "bookkeeper", "other"] as const;
export const PRO_WAITLIST_FREQUENCIES = ["weekly", "monthly", "quarterly", "rarely"] as const;

export const ProWaitlistSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(PRO_WAITLIST_ROLES),
  frequency: z.enum(PRO_WAITLIST_FREQUENCIES),
  language: z.enum(["cs", "en", "mk"]).default("cs"),
  source: z.enum(["pro-page", "accounting-outreach"]).default("pro-page"),
  contact_consent: z.literal(true),
  turnstile_token: z.string().optional(),
});

export type SendInitInput = z.infer<typeof SendInitSchema>;
export type ReceiveInitInput = z.infer<typeof ReceiveInitSchema>;
export type ReceiveFileInitInput = z.infer<typeof ReceiveFileInitSchema>;
export type CreateOpenLinkInput = z.infer<typeof CreateOpenLinkSchema>;
export type CliUploadAuthorizationInput = z.infer<typeof CliUploadAuthorizationSchema>;
export type ProWaitlistInput = z.infer<typeof ProWaitlistSchema>;
