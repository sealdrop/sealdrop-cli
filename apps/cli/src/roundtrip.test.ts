import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendCommand } from "./send.js";
import { downloadCommand } from "./download.js";

describe("CLI send/download compatibility", () => {
  const dirs: string[] = [];
  afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

  it("round-trips an encrypted padded file through the HTTP API", async () => {
    let metadata: Record<string, unknown> = {};
    const parts = new Map<number, Uint8Array>();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/api/cli/config") return Response.json({ upload_authorization_required: false, verification_url: "" });
      if (url.pathname === "/api/send/init") {
        metadata = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ file_id: "abc123", expires_at: "2030-01-01T00:00:00.000Z", delete_token: "delete-secret" }, { status: 201 });
      }
      if (url.pathname === "/api/send/abc123/upload-status") return Response.json({ part_count: 1, uploaded_parts: [] });
      const part = /^\/api\/send\/abc123\/part\/(\d+)$/.exec(url.pathname);
      if (part && init?.body) { parts.set(Number(part[1]), new Uint8Array(await new Response(init.body).arrayBuffer())); return Response.json({ ok: true }); }
      if (url.pathname === "/api/send/abc123/complete") return Response.json({ ok: true });
      if (url.pathname === "/api/send/abc123/metadata") return Response.json({ ...metadata, expires_at: "2030-01-01T00:00:00.000Z", remaining_downloads: -1 });
      if (url.pathname === "/api/send/abc123/blob") {
        const ordered = [...parts.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
        return new Response(new Blob(ordered.map((value) => value.buffer as ArrayBuffer)), { headers: { "Content-Type": "application/octet-stream" } });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    }));
    const dir = await mkdtemp(join(tmpdir(), "sealdrop-cli-")); dirs.push(dir);
    const input = join(dir, "input.bin"); const output = join(dir, "output.bin");
    const plaintext = Buffer.from("SealDrop CLI encrypted round trip\n".repeat(200));
    await writeFile(input, plaintext);
    let sendJson = "";
    vi.spyOn(console, "log").mockImplementation((value) => { sendJson = String(value); });
    await sendCommand(input, { positionals: [], options: { server: "https://example.test", json: true } });
    const shareUrl = (JSON.parse(sendJson) as { shareUrl: string }).shareUrl;
    vi.mocked(console.log).mockImplementation(() => {});
    await downloadCommand(shareUrl, { positionals: [], options: { output, json: true } });
    expect(await readFile(output)).toEqual(plaintext);
  }, 15_000);
});
