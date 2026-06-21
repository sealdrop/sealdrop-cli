import { toBase64Url, fromBase64Url } from "./encoding.js";

const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };
const ECDH_IMPORT_PARAMS: EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" };

// Domain separation label for HKDF so derived keys can't be confused with other uses
const HKDF_INFO = new TextEncoder().encode("sealdrop-file-key-v1");

export async function generateOwnerKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return toBase64Url(spki);
}

export async function importPublicKey(b64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", fromBase64Url(b64url), ECDH_IMPORT_PARAMS, true, []);
}

export interface WrappedFileKey {
  wrappedKey: string;        // base64url — AES-GCM ciphertext of the raw file key
  ephemeralPublicKey: string; // base64url — SPKI of ephemeral ECDH public key
  wrappedKeyIv: string;      // base64url — IV used when encrypting the file key
}

export async function wrapFileKey(fileKey: CryptoKey, ownerPublicKey: CryptoKey): Promise<WrappedFileKey> {
  const ephemeral = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"]);
  const wrappingKey = await deriveWrappingKey(ephemeral.privateKey, ownerPublicKey);

  const rawFileKey = await crypto.subtle.exportKey("raw", fileKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKeyBytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawFileKey);
  const ephemeralSpki = await crypto.subtle.exportKey("spki", ephemeral.publicKey);

  return {
    wrappedKey: toBase64Url(wrappedKeyBytes),
    ephemeralPublicKey: toBase64Url(ephemeralSpki),
    wrappedKeyIv: toBase64Url(iv.buffer as ArrayBuffer),
  };
}

export async function unwrapFileKey(
  wrappedKey: string,
  ephemeralPublicKey: string,
  wrappedKeyIv: string,
  ownerPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const ephPubKey = await crypto.subtle.importKey(
    "spki",
    fromBase64Url(ephemeralPublicKey),
    ECDH_IMPORT_PARAMS,
    true,
    [],
  );
  const wrappingKey = await deriveWrappingKey(ownerPrivateKey, ephPubKey);

  const iv = new Uint8Array(fromBase64Url(wrappedKeyIv));
  const rawFileKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    fromBase64Url(wrappedKey),
  );

  return crypto.subtle.importKey("raw", rawFileKey, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveWrappingKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
