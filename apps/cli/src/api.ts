import type { CliConfigResponse, CliUploadGrantResponse, SendMetadataResponse, UploadStatusResponse } from "@sealdrop/shared";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export class ApiClient {
  readonly origin: string;
  constructor(server: string) { this.origin = new URL(server).origin; }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.origin}${path}`, init);
    if (!response.ok) throw new ApiError(response.status, `SealDrop API returned ${response.status}`);
    return response.json() as Promise<T>;
  }

  async config(): Promise<CliConfigResponse> {
    try { return await this.json("/api/cli/config"); }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) return { upload_authorization_required: false, verification_url: "" };
      throw error;
    }
  }

  authorizeStatus(requestNonce: string, deviceSecret: string): Promise<CliUploadGrantResponse | { status: "pending" }> {
    return this.json(`/api/cli/upload-authorizations/status?request_nonce=${encodeURIComponent(requestNonce)}`, {
      headers: { "X-CLI-Device-Secret": deviceSecret },
    });
  }

  sendInit(body: unknown, grant?: { id: string; secret: string }): Promise<{ file_id: string; expires_at: string; delete_token?: string }> {
    return this.json("/api/send/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(grant ? { "X-CLI-Upload-Grant": grant.id, "X-CLI-Device-Secret": grant.secret } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async uploadPart(fileId: string, part: number, data: Uint8Array): Promise<void> {
    const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const response = await fetch(`${this.origin}/api/send/${encodeURIComponent(fileId)}/part/${part}`, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Blob([body]),
    });
    if (!response.ok) throw new ApiError(response.status, `part ${part} upload failed (${response.status})`);
  }

  async complete(fileId: string): Promise<void> {
    const response = await fetch(`${this.origin}/api/send/${encodeURIComponent(fileId)}/complete`, { method: "PUT" });
    if (!response.ok) throw new ApiError(response.status, `upload completion failed (${response.status})`);
  }

  uploadStatus(fileId: string): Promise<UploadStatusResponse> { return this.json(`/api/send/${encodeURIComponent(fileId)}/upload-status`); }
  metadata(fileId: string): Promise<SendMetadataResponse> { return this.json(`/api/send/${encodeURIComponent(fileId)}/metadata`); }

  async blob(fileId: string): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.origin}/api/send/${encodeURIComponent(fileId)}/blob`);
    if (!response.ok || !response.body) throw new ApiError(response.status, `download failed (${response.status})`);
    return response.body;
  }

  async delete(fileId: string, token: string): Promise<void> {
    const response = await fetch(`${this.origin}/api/send/${encodeURIComponent(fileId)}`, {
      method: "DELETE", headers: { "X-Delete-Token": token },
    });
    if (!response.ok) throw new ApiError(response.status, `delete failed (${response.status})`);
  }

  createOpenLink(body: unknown): Promise<{ handoff_id: string; expires_at: string }> {
    return this.json("/api/open-links", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }
}

export async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await operation(); }
    catch (error) {
      last = error;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) throw error;
      if (i + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw last;
}
