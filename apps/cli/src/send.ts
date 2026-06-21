import { open, stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  CHUNK_SIZE_BYTES, createChainedHasher, encryptChunk, encryptHandoffUrl, encryptMetadata,
  enhancedPaddedSize, fillRandom, generateAccessCode, generateFileKey, generateIV,
  keyToFragment, maximumPaddedSize, padToBlock, padToSize, toBase64Url,
  wrapKeyWithAccessCode, wrapKeyWithPassphrase,
} from "@sealdrop/crypto";
import { MAX_FILE_SIZE_BYTES, SEND_EXPIRY_PRESETS, TRANSPORT_CHUNKS_PER_PART, type SendExpiryPreset } from "@sealdrop/shared";
import { ApiClient, retry } from "./api.js";
import { getUploadGrant } from "./auth.js";
import { progress, readSecret } from "./io.js";
import { terminalQr } from "./qr.js";
import { stringOption, type ParsedArgs } from "./args.js";

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function readRange(handle: Awaited<ReturnType<typeof open>>, start: number, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Uint8Array(length) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(out, offset, length - offset, start + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset === length ? out : (out.slice(0, offset) as Uint8Array<ArrayBuffer>);
}

export async function sendCommand(filePath: string, args: ParsedArgs): Promise<void> {
  const json = args.options["json"] === true;
  const expiry = (stringOption(args.options, "expires") ?? "open-once") as SendExpiryPreset;
  if (!(SEND_EXPIRY_PRESETS as readonly string[]).includes(expiry)) throw new Error(`invalid expiry: ${expiry}`);
  const padding = stringOption(args.options, "padding") ?? "standard";
  if (!(["standard", "enhanced", "maximum"] as const).includes(padding as "standard")) throw new Error(`invalid padding: ${padding}`);
  if (args.options["passphrase"] && args.options["access-code"]) throw new Error("--passphrase and --access-code are mutually exclusive");
  const passphrase = args.options["passphrase"]
    ? await readSecret("Passphrase", stringOption(args.options, "passphrase-file"))
    : undefined;
  if (passphrase !== undefined && passphrase.length < 8) throw new Error("passphrase must be at least 8 characters");
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) throw new Error("input must be a non-empty regular file");
  if (info.size > MAX_FILE_SIZE_BYTES) throw new Error("file exceeds the 200 GiB limit");
  const server = stringOption(args.options, "server") ?? process.env["SEALDROP_SERVER"] ?? "https://sealdrop.io";
  const api = new ApiClient(server);
  const grant = await getUploadGrant(api, info.size, expiry, json);
  const key = await generateFileKey();
  const fileIv = generateIV();
  const metadataIv = generateIV();
  const realChunkCount = Math.ceil(info.size / CHUNK_SIZE_BYTES);
  let paddedSizeBytes: number | undefined;
  if (padding === "enhanced") paddedSizeBytes = enhancedPaddedSize(info.size);
  if (padding === "maximum") paddedSizeBytes = maximumPaddedSize(info.size);
  if (paddedSizeBytes === info.size) paddedSizeBytes = undefined;
  const chunkCount = paddedSizeBytes ? Math.ceil(paddedSizeBytes / CHUNK_SIZE_BYTES) : realChunkCount;
  const handle = await open(filePath, "r");
  let fileId: string | undefined;
  let deleteToken: string | undefined;
  let expiresAt: string | undefined;
  try {
    progress("Hashing file…", json);
    const hasher = createChainedHasher();
    for (let i = 0; i < realChunkCount; i++) {
      const length = Math.min(CHUNK_SIZE_BYTES, info.size - i * CHUNK_SIZE_BYTES);
      await hasher.update(await readRange(handle, i * CHUNK_SIZE_BYTES, length));
    }
    const digest = hasher.digest();
    if (!digest) throw new Error("failed to hash input file");
    const note = stringOption(args.options, "note");
    const metadata = await encryptMetadata({
      filename: basename(filePath), mimeType: "application/octet-stream", sizeBytes: info.size,
      storageFormat: "stream-v1", chunkSizeBytes: CHUNK_SIZE_BYTES, chunkCount,
      padded: true, sha256: toBase64Url(digest),
      ...(paddedSizeBytes ? { paddedSizeBytes } : {}),
      ...(note ? { note } : {}),
    }, key, metadataIv);
    const initialized = await api.sendInit({
      size_bytes: info.size, expiry_preset: expiry,
      encrypted_metadata: toBase64Url(metadata), metadata_iv: toBase64Url(exactArrayBuffer(metadataIv)), file_iv: toBase64Url(exactArrayBuffer(fileIv)),
      chunk_count: chunkCount, want_delete_link: args.options["no-delete-token"] !== true,
    }, grant);
    fileId = initialized.file_id;
    deleteToken = initialized.delete_token;
    expiresAt = initialized.expires_at;
    const status = await api.uploadStatus(fileId);
    const partCount = Math.ceil(chunkCount / TRANSPORT_CHUNKS_PER_PART);
    for (let part = 0; part < partCount; part++) {
      if (status.uploaded_parts.includes(part)) continue;
      const encryptedChunks: Uint8Array[] = [];
      const start = part * TRANSPORT_CHUNKS_PER_PART;
      const end = Math.min(chunkCount, start + TRANSPORT_CHUNKS_PER_PART);
      for (let index = start; index < end; index++) {
        let plaintext: ArrayBuffer;
        if (paddedSizeBytes) {
          const target = Math.min(CHUNK_SIZE_BYTES, paddedSizeBytes - index * CHUNK_SIZE_BYTES);
          if (index < realChunkCount) {
            const length = Math.min(CHUNK_SIZE_BYTES, info.size - index * CHUNK_SIZE_BYTES);
            plaintext = padToSize(exactArrayBuffer(await readRange(handle, index * CHUNK_SIZE_BYTES, length)), target);
          } else {
            const random = new Uint8Array(target) as Uint8Array<ArrayBuffer>; fillRandom(random); plaintext = random.buffer;
          }
        } else {
          const length = Math.min(CHUNK_SIZE_BYTES, info.size - index * CHUNK_SIZE_BYTES);
          plaintext = exactArrayBuffer(await readRange(handle, index * CHUNK_SIZE_BYTES, length));
          if (index === chunkCount - 1) plaintext = padToBlock(plaintext);
        }
        encryptedChunks.push(new Uint8Array(await encryptChunk(plaintext, key, fileIv, index)));
      }
      const bytes = new Uint8Array(encryptedChunks.reduce((n, item) => n + item.byteLength, 0));
      let offset = 0; for (const item of encryptedChunks) { bytes.set(item, offset); offset += item.byteLength; }
      progress(`Uploading part ${part + 1}/${partCount}…`, json);
      await retry(() => api.uploadPart(fileId!, part, bytes));
    }
    await retry(() => api.complete(fileId!));
  } catch (error) {
    if (fileId && deleteToken) await api.delete(fileId, deleteToken).catch(() => {});
    throw error;
  } finally { await handle.close(); }

  const origin = api.origin;
  let shareUrl: string;
  let accessCode: string | undefined;
  if (args.options["access-code"]) {
    accessCode = generateAccessCode();
    const wrapped = await wrapKeyWithAccessCode(key, accessCode);
    const salt = toBase64Url(exactArrayBuffer(wrapped.salt)); const iv = toBase64Url(exactArrayBuffer(wrapped.iv));
    shareUrl = `${origin}/s/${fileId}#key=${wrapped.wrappedKey}:${salt}:${iv}&ac=1`;
  } else if (args.options["passphrase"]) {
    const wrapped = await wrapKeyWithPassphrase(key, passphrase!);
    shareUrl = `${origin}/s/${fileId}#key=${wrapped.wrappedKey}:${toBase64Url(exactArrayBuffer(wrapped.salt))}:${toBase64Url(exactArrayBuffer(wrapped.iv))}`;
  } else {
    shareUrl = `${origin}/s/${fileId}#key=${await keyToFragment(key)}`;
  }
  const deleteUrl = deleteToken ? `${origin}/s/${fileId}/delete#token=${deleteToken}` : undefined;
  let handoffCode: string | undefined;
  if (args.options["handoff"]) {
    try {
      const encrypted = await encryptHandoffUrl(shareUrl);
      const result = await api.createOpenLink({
        encrypted_payload: encrypted.encryptedPayload, payload_iv: encrypted.payloadIv,
        kdf_salt: encrypted.kdfSalt, kdf_iterations: encrypted.kdfIterations,
      });
      handoffCode = `${result.handoff_id} ${encrypted.secret.slice(0, 3)} ${encrypted.secret.slice(3, 6)} ${encrypted.secret.slice(6)}`;
    } catch (error) {
      if (deleteToken) await api.delete(fileId!, deleteToken).catch(() => {});
      throw error;
    }
  }
  const output = { fileId, shareUrl, expiresAt, deleteUrl, accessCode, handoffCode };
  if (json) console.log(JSON.stringify(output));
  else {
    console.log(`Share URL: ${shareUrl}`);
    if (accessCode) console.log(`Access code: ${accessCode}`);
    if (deleteUrl) console.log(`Delete URL: ${deleteUrl}`);
    if (handoffCode) console.log(`Handoff code: ${handoffCode}`);
    if (args.options["qr"]) console.log(terminalQr(handoffCode ?? shareUrl));
  }
}
