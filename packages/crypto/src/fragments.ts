import { toBase64Url, fromBase64Url } from "./encoding.js";

const ECDH_IMPORT_PARAMS: EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" };

export async function keyToFragment(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64Url(raw);
}

export async function fragmentToKey(fragment: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(fragment),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function privateKeyToFragment(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
  return toBase64Url(pkcs8);
}

export async function fragmentToPrivateKey(fragment: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", fromBase64Url(fragment), ECDH_IMPORT_PARAMS, true, [
    "deriveKey",
    "deriveBits",
  ]);
}

export function buildSendLink(fileId: string, keyFragment: string, explicitOrigin?: string): string {
  const origin = explicitOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/s/${fileId}#key=${keyFragment}`;
}

export function buildOwnerLink(dropId: string, privateKeyFragment: string, explicitOrigin?: string): string {
  const origin = explicitOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/r/${dropId}/owner#privateKey=${privateKeyFragment}`;
}

export function parseSendFragment(hash: string): string | null {
  const match = /[#&]key=([^&]+)/.exec(hash);
  return match?.[1] ?? null;
}

export function parseOwnerFragment(hash: string): string | null {
  const match = /[#&]privateKey=([^&]+)/.exec(hash);
  return match?.[1] ?? null;
}
