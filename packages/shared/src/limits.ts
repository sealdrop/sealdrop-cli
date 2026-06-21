export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024 * 1024; // 200 GiB
export const MAX_SEND_EXPIRY_DAYS = 7;
export const MAX_RECEIVE_EXPIRY_DAYS = 7;
export const MAX_FILES_PER_DROP = 3;
export const FILE_ID_BYTES = 16;
export const DROP_ID_BYTES = 16;
export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const TRANSPORT_CHUNKS_PER_PART = 8; // ~80 MiB request bodies, below common Worker limits
