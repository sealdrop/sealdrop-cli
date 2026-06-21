import { toBase64Url, fromBase64Url } from "./encoding.js";

// Unambiguous characters — excludes 0/O, 1/I/L
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const HANDOFF_ID_LENGTH = 6;
const SECRET_DIGITS = 9;
const SALT_BYTES = 16;
const IV_BYTES = 12;
export const HANDOFF_KDF_ITERATIONS = 100_000;

export function generateHandoffId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(HANDOFF_ID_LENGTH));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]!).join("");
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_DIGITS));
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

/** "A7KP2M 482 913 774" */
export function formatHandoffCode(handoffId: string, secret: string): string {
  return `${handoffId} ${secret.slice(0, 3)} ${secret.slice(3, 6)} ${secret.slice(6, 9)}`;
}

/** Parse "A7KP2M 482 913 774" (or stripped "A7KP2M482913774") → {handoffId, secret} */
export function parseHandoffCode(code: string): { handoffId: string; secret: string } | null {
  const stripped = code.replace(/[\s-]/g, "").toUpperCase();
  if (stripped.length !== HANDOFF_ID_LENGTH + SECRET_DIGITS) return null;
  const handoffId = stripped.slice(0, HANDOFF_ID_LENGTH);
  const secret = stripped.slice(HANDOFF_ID_LENGTH);
  if (!/^\d{9}$/.test(secret)) return null;
  return { handoffId, secret };
}

async function deriveHandoffKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: HANDOFF_KDF_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface HandoffEncryptResult {
  handoffId: string;
  secret: string;
  displayCode: string;
  encryptedPayload: string;
  payloadIv: string;
  kdfSalt: string;
  kdfIterations: number;
}

export async function encryptHandoffUrl(fullUrl: string): Promise<HandoffEncryptResult> {
  const handoffId = generateHandoffId();
  const secret = generateSecret();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES) as Uint8Array<ArrayBuffer>);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES) as Uint8Array<ArrayBuffer>);
  const key = await deriveHandoffKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(fullUrl),
  );
  return {
    handoffId,
    secret,
    displayCode: formatHandoffCode(handoffId, secret),
    encryptedPayload: toBase64Url(ciphertext),
    payloadIv: toBase64Url(iv.buffer as ArrayBuffer),
    kdfSalt: toBase64Url(salt.buffer as ArrayBuffer),
    kdfIterations: HANDOFF_KDF_ITERATIONS,
  };
}

export async function decryptHandoffUrl(
  secret: string,
  data: { encryptedPayload: string; payloadIv: string; kdfSalt: string; kdfIterations: number },
): Promise<string> {
  const salt = new Uint8Array(fromBase64Url(data.kdfSalt));
  const iv = new Uint8Array(fromBase64Url(data.payloadIv));
  const ciphertext = fromBase64Url(data.encryptedPayload);
  const key = await deriveHandoffKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
