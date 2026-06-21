// DB row types — mirrored in Postgres and D1 schemas

export interface SendFile {
  file_id: string;
  object_key: string;
  encrypted_metadata: string; // base64
  metadata_iv: string; // base64
  file_iv: string; // base64
  size_bytes: number;
  chunk_count: number;
  delete_token: string | null;
  created_at: string; // ISO
  expires_at: string; // ISO
  remaining_downloads: number;
  upload_complete: boolean;
  deleted_at: string | null;
  uploaded_parts: string; // JSON: number[]
}

export interface ReceiveSession {
  drop_id: string;
  public_key: string; // base64url exported ECDH P-256 public key
  created_at: string;
  expires_at: string;
  max_files: number;
  received_file_count: number;
  closed_at: string | null;
}

export interface ReceivedFile {
  received_file_id: string;
  drop_id: string;
  object_key: string;
  encrypted_metadata: string; // base64
  metadata_iv: string; // base64
  file_iv: string; // base64
  wrapped_file_key: string; // base64 — AES key wrapped to owner public key
  ephemeral_public_key: string; // base64 — ephemeral ECDH key used for wrapping
  wrapped_key_iv: string; // base64
  size_bytes: number;
  chunk_count: number;
  created_at: string;
  upload_complete: boolean;
  deleted_at: string | null;
  uploaded_parts: string; // JSON: number[]
}

// API response types

export interface ApiError {
  error: string;
}

export interface SendInitResponse {
  file_id: string;
  delete_token?: string;
}

export interface SendMetadataResponse {
  encrypted_metadata: string;
  metadata_iv: string;
  file_iv: string;
  size_bytes: number;
  chunk_count?: number;
  expires_at: string;
  remaining_downloads: number;
}

export interface ReceiveInitResponse {
  drop_id: string;
}

export interface ReceiveSessionResponse {
  drop_id: string;
  public_key: string;
  expires_at: string;
  max_files: number;
  received_file_count: number;
  is_open: boolean;
}

export interface ReceiveFileInitResponse {
  received_file_id: string;
}

export interface ReceivedFileRecord {
  received_file_id: string;
  encrypted_metadata: string;
  metadata_iv: string;
  file_iv: string;
  wrapped_file_key: string;
  ephemeral_public_key: string;
  wrapped_key_iv: string;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
}

export interface OwnerFilesResponse {
  files: ReceivedFileRecord[];
}

export type ExpiryMessage =
  | { type: "send_file"; file_id: string; object_key: string; expires_at: string }
  | { type: "receive_session"; drop_id: string; expires_at: string };

export interface UploadStatusResponse {
  part_count: number;
  uploaded_parts: number[];
}

export interface CliConfigResponse {
  upload_authorization_required: boolean;
  verification_url: string;
}

export interface CliUploadGrantResponse {
  status: "approved";
  grant_id: string;
  expires_at: string;
}
