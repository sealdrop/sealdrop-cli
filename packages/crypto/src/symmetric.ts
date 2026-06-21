const IV_BYTES = 12; // 96 bits — required for AES-GCM
const KEY_BITS = 256;

export interface FileMetadata {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageFormat?: "stream-v1";
  chunkSizeBytes?: number;
  chunkCount?: number;
  padded?: true;
  paddedSizeBytes?: number;
  note?: string;
  /** Base64url SHA-256 chained hash (see integrity.ts) of the original file bytes. */
  sha256?: string;
}

export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: KEY_BITS }, true, ["encrypt", "decrypt"]);
}

export function generateIV(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES) as Uint8Array<ArrayBuffer>);
}

export async function encryptFile(data: ArrayBuffer, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
}

export async function decryptFile(data: ArrayBuffer, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}

export async function encryptMetadata(meta: FileMetadata, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(meta));
  return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
}

export async function decryptMetadata(data: ArrayBuffer, key: CryptoKey, iv: Uint8Array<ArrayBuffer>): Promise<FileMetadata> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted)) as FileMetadata;
}
