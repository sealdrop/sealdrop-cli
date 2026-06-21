import { toBase64Url, fromBase64Url } from "./encoding.js";
import { wrapKeyWithPassphrase, unwrapKeyWithPassphrase } from "./passphrase.js";
import type { WrappedKeyResult } from "./passphrase.js";

// Unambiguous characters — excludes 0/O, 1/I/L
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Generate a random 8-char access code formatted as XXXX-XXXX. */
export function generateAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]!);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Strip formatting before use as PBKDF2 input; case-insensitive. */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/-/g, "");
}

/** Wrap a file key with a browser-generated access code (PBKDF2 + AES-GCM). */
export async function wrapKeyWithAccessCode(
  fileKey: CryptoKey,
  code: string,
): Promise<WrappedKeyResult> {
  return wrapKeyWithPassphrase(fileKey, normalizeCode(code));
}

/** Unwrap a file key using the access code entered by the recipient. */
export async function unwrapKeyWithAccessCode(
  wrappedKeyB64: string,
  code: string,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<CryptoKey> {
  return unwrapKeyWithPassphrase(wrappedKeyB64, normalizeCode(code), salt, iv);
}

/**
 * Build a share link for an access-code protected file.
 * The fragment has the same shape as a passphrase link, but with &ac=1 appended
 * so the recipient page can tell them apart.
 */
export function buildAccessCodeLink(
  fileId: string,
  wrappedKey: string,
  salt: Uint8Array,
  iv: Uint8Array,
  explicitOrigin?: string,
): string {
  const origin = explicitOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const saltB64 = toBase64Url(salt.buffer as ArrayBuffer);
  const ivB64 = toBase64Url(iv.buffer as ArrayBuffer);
  return `${origin}/s/${fileId}#key=${wrappedKey}:${saltB64}:${ivB64}&ac=1`;
}

/**
 * Detect an access-code protected link from the URL hash.
 * Returns null for plain links and passphrase links (which lack &ac=1).
 */
export function parseAccessCodeFragment(
  hash: string,
): { wrappedKey: string; salt: Uint8Array; iv: Uint8Array } | null {
  if (!/[#&]ac=1/.test(hash)) return null;
  const match = /[#&]key=([^&]+)/.exec(hash);
  if (!match) return null;
  const parts = match[1]!.split(":");
  if (parts.length !== 3) return null;
  const [wrappedKey, saltB64, ivB64] = parts;
  if (!wrappedKey || !saltB64 || !ivB64) return null;
  return {
    wrappedKey,
    salt: new Uint8Array(fromBase64Url(saltB64)),
    iv: new Uint8Array(fromBase64Url(ivB64)),
  };
}
