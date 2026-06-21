import { toBase64Url, fromBase64Url } from "./encoding.js";

export const SALT_BYTES = 16;
export const PBKDF2_ITERATIONS = 600_000;

const WRAPPED_KEY_IV_BYTES = 12;

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  if (passphrase.length < 8) throw new Error("passphrase must be at least 8 characters");

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export interface WrappedKeyResult {
  wrappedKey: string;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
}

export async function wrapKeyWithPassphrase(
  fileKey: CryptoKey,
  passphrase: string,
): Promise<WrappedKeyResult> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES) as Uint8Array<ArrayBuffer>);
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(WRAPPED_KEY_IV_BYTES) as Uint8Array<ArrayBuffer>);

  const rawKey = await crypto.subtle.exportKey("raw", fileKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, wrappingKey, rawKey);

  return {
    wrappedKey: toBase64Url(wrapped),
    salt,
    iv,
  };
}

export async function unwrapKeyWithPassphrase(
  wrappedKeyB64: string,
  passphrase: string,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<CryptoKey> {
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const wrapped = fromBase64Url(wrappedKeyB64);

  const rawKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, wrappingKey, wrapped);

  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export function buildPassphraseLink(
  fileId: string,
  wrappedKey: string,
  salt: Uint8Array,
  iv: Uint8Array,
  explicitOrigin?: string,
): string {
  const origin = explicitOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const saltB64 = toBase64Url(salt.buffer as ArrayBuffer);
  const ivB64 = toBase64Url(iv.buffer as ArrayBuffer);
  return `${origin}/s/${fileId}#key=${wrappedKey}:${saltB64}:${ivB64}`;
}

export function parsePassphraseFragment(
  hash: string,
): { wrappedKey: string; salt: Uint8Array; iv: Uint8Array } | null {
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
