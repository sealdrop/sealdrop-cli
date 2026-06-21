import { open, rename, rm, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  CHUNK_SIZE_BYTES, createChainedHasher, decryptStream, decryptMetadata, fragmentToKey,
  fromBase64Url, parseAccessCodeFragment, parsePassphraseFragment, parseSendFragment,
  paddedLength, toBase64Url, unwrapKeyWithAccessCode, unwrapKeyWithPassphrase,
} from "@sealdrop/crypto";
import { ApiClient } from "./api.js";
import { progress, readSecret } from "./io.js";
import { stringOption, type ParsedArgs } from "./args.js";

export function parseShareUrl(value: string): { url: URL; fileId: string } {
  const url = new URL(value);
  const match = /^\/s\/([A-Za-z0-9]+)$/.exec(url.pathname);
  if (!match?.[1]) throw new Error("not a SealDrop share URL");
  return { url, fileId: match[1] };
}

export async function downloadCommand(value: string, args: ParsedArgs): Promise<void> {
  const json = args.options["json"] === true;
  const { url, fileId } = parseShareUrl(value);
  const server = stringOption(args.options, "server") ?? process.env["SEALDROP_SERVER"] ?? url.origin;
  const api = new ApiClient(server);
  const serverMeta = await api.metadata(fileId);
  let key: CryptoKey;
  const ac = parseAccessCodeFragment(url.hash);
  const pp = parsePassphraseFragment(url.hash);
  if (ac) {
    const code = await readSecret("Access code", stringOption(args.options, "access-code-file"));
    key = await unwrapKeyWithAccessCode(ac.wrappedKey, code, ac.salt, ac.iv);
  } else if (pp) {
    const passphrase = await readSecret("Passphrase", stringOption(args.options, "passphrase-file"));
    key = await unwrapKeyWithPassphrase(pp.wrappedKey, passphrase, pp.salt, pp.iv);
  } else {
    const fragment = parseSendFragment(url.hash);
    if (!fragment) throw new Error("share URL has no encryption key");
    key = await fragmentToKey(fragment);
  }
  const metadata = await decryptMetadata(fromBase64Url(serverMeta.encrypted_metadata), key, new Uint8Array(fromBase64Url(serverMeta.metadata_iv)) as Uint8Array<ArrayBuffer>);
  const count = metadata.chunkCount ?? serverMeta.chunk_count ?? 1;
  const chunkSize = metadata.chunkSizeBytes ?? CHUNK_SIZE_BYTES;
  const finalReal = metadata.sizeBytes - (count - 1) * chunkSize;
  const decryptLength = metadata.paddedSizeBytes
    ?? (metadata.padded ? (count - 1) * chunkSize + paddedLength(Math.max(0, finalReal)) : metadata.sizeBytes);
  const target = resolve(stringOption(args.options, "output") ?? basename(metadata.filename));
  const temp = `${target}.part`;
  if (!args.options["force"]) {
    await stat(target).then(() => { throw new Error(`output already exists: ${target}`); }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await rm(temp, { force: true });
  const output = await open(temp, "wx");
  let written = 0;
  let integrity: "verified" | "unavailable" = "unavailable";
  try {
    progress(`Downloading ${metadata.filename}…`, json);
    const decrypted = decryptStream(await api.blob(fileId), key, new Uint8Array(fromBase64Url(serverMeta.file_iv)) as Uint8Array<ArrayBuffer>, decryptLength, undefined, chunkSize);
    const reader = decrypted.getReader();
    const hasher = createChainedHasher();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      const remaining = metadata.sizeBytes - written;
      if (remaining <= 0) continue;
      const original = chunk.subarray(0, Math.min(chunk.byteLength, remaining));
      await output.write(original);
      await hasher.update(original);
      written += original.byteLength;
    }
    if (written !== metadata.sizeBytes) throw new Error("download ended before the declared file size");
    if (metadata.sha256) {
      const digest = hasher.digest();
      if (!digest || toBase64Url(digest) !== metadata.sha256) throw new Error("file integrity verification failed");
      integrity = "verified";
    }
    await output.sync();
    await output.close();
    if (args.options["force"]) await rm(target, { force: true });
    await rename(temp, target);
  } catch (error) {
    await output.close().catch(() => {});
    await rm(temp, { force: true });
    throw error;
  }
  const result = { path: target, filename: metadata.filename, sizeBytes: metadata.sizeBytes, integrity };
  if (json) console.log(JSON.stringify(result));
  else console.log(`Saved ${target} (${integrity === "verified" ? "integrity verified" : "no integrity digest"})`);
}
