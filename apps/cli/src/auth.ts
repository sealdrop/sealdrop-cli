import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { ApiClient } from "./api.js";
import { progress } from "./io.js";

function base64url(value: Buffer): string { return value.toString("base64url"); }

function openBrowser(url: string): boolean {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch { return false; }
}

export async function getUploadGrant(api: ApiClient, sizeBytes: number, expiryPreset: string, json: boolean): Promise<{ id: string; secret: string } | undefined> {
  const config = await api.config();
  if (!config.upload_authorization_required) return undefined;
  const deviceSecret = base64url(randomBytes(32));
  const requestNonce = base64url(randomBytes(32));
  const secretProof = createHash("sha256").update(deviceSecret).digest("base64url");
  const url = new URL(config.verification_url);
  url.searchParams.set("request_nonce", requestNonce);
  url.searchParams.set("secret_proof", secretProof);
  url.searchParams.set("size_bytes", String(sizeBytes));
  url.searchParams.set("expiry_preset", expiryPreset);
  const opened = openBrowser(url.href);
  progress(opened
    ? `Approve this upload in the browser…\nIf it did not open, visit: ${url.href}`
    : `Open this URL to authorize the upload:\n${url.href}`, false);

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await api.authorizeStatus(requestNonce, deviceSecret);
    if (status.status === "approved") return { id: status.grant_id, secret: deviceSecret };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("CLI upload authorization timed out");
}
