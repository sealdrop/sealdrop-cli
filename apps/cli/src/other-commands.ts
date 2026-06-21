import { encryptHandoffUrl } from "@sealdrop/crypto";
import { ApiClient } from "./api.js";
import { terminalQr } from "./qr.js";
import { parseShareUrl } from "./download.js";
import { stringOption, type ParsedArgs } from "./args.js";

export async function deleteCommand(value: string, args: ParsedArgs): Promise<void> {
  const url = new URL(value);
  const match = /^\/s\/([A-Za-z0-9]+)\/delete$/.exec(url.pathname);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  if (!match?.[1] || !token) throw new Error("not a complete SealDrop delete URL");
  const api = new ApiClient(stringOption(args.options, "server") ?? process.env["SEALDROP_SERVER"] ?? url.origin);
  await api.delete(match[1], token);
  const result = { deleted: true, fileId: match[1] };
  if (args.options["json"]) console.log(JSON.stringify(result)); else console.log("File deleted.");
}

export async function handoffCommand(value: string, args: ParsedArgs): Promise<void> {
  const { url } = parseShareUrl(value);
  const api = new ApiClient(stringOption(args.options, "server") ?? process.env["SEALDROP_SERVER"] ?? url.origin);
  const encrypted = await encryptHandoffUrl(value);
  const result = await api.createOpenLink({
    encrypted_payload: encrypted.encryptedPayload, payload_iv: encrypted.payloadIv,
    kdf_salt: encrypted.kdfSalt, kdf_iterations: encrypted.kdfIterations,
  });
  const code = `${result.handoff_id} ${encrypted.secret.slice(0, 3)} ${encrypted.secret.slice(3, 6)} ${encrypted.secret.slice(6)}`;
  if (args.options["json"]) console.log(JSON.stringify({ handoffCode: code, expiresAt: result.expires_at }));
  else { console.log(`Handoff code: ${code}`); if (args.options["qr"]) console.log(terminalQr(code)); }
}
