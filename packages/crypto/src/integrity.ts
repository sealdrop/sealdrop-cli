/**
 * Streaming-friendly file integrity check.
 *
 * Builds a SHA-256 hash chain over successive chunks (hash_i =
 * SHA256(hash_{i-1} || chunk_i), hash_0 = SHA256(chunk_0)) so the whole file
 * never needs to be held in memory at once. The sender computes this over the
 * original (unpadded) file bytes and stores the result in the encrypted
 * metadata; the recipient recomputes it over the decrypted bytes it writes to
 * disk and compares.
 */
export interface ChainedHasher {
  update(chunk: ArrayBuffer | Uint8Array): Promise<void>;
  /** Returns the final digest, or null if update() was never called. */
  digest(): ArrayBuffer | null;
}

export function createChainedHasher(): ChainedHasher {
  let state: ArrayBuffer | null = null;

  return {
    async update(chunk) {
      const bytes = (chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)) as Uint8Array<ArrayBuffer>;

      if (state === null) {
        state = await crypto.subtle.digest("SHA-256", bytes);
        return;
      }

      const combined = new Uint8Array(state.byteLength + bytes.byteLength);
      combined.set(new Uint8Array(state), 0);
      combined.set(bytes, state.byteLength);
      state = await crypto.subtle.digest("SHA-256", combined);
    },
    digest() {
      return state;
    },
  };
}
