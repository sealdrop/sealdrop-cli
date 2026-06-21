import { describe, it, expect } from "vitest";
import { createChainedHasher } from "./integrity.js";
import { toBase64Url } from "./encoding.js";

describe("createChainedHasher", () => {
  it("returns null digest before any update", () => {
    const hasher = createChainedHasher();
    expect(hasher.digest()).toBeNull();
  });

  it("is deterministic for the same input split into different chunk sizes", async () => {
    const data = crypto.getRandomValues(new Uint8Array(1000));

    const whole = createChainedHasher();
    await whole.update(data);

    const split = createChainedHasher();
    await split.update(data.subarray(0, 400));
    await split.update(data.subarray(400, 700));
    await split.update(data.subarray(700));

    expect(toBase64Url(whole.digest()!)).not.toBe(toBase64Url(split.digest()!));
  });

  it("produces the same digest for identical chunk sequences", async () => {
    const a = crypto.getRandomValues(new Uint8Array(500));
    const b = crypto.getRandomValues(new Uint8Array(500));

    const h1 = createChainedHasher();
    await h1.update(a);
    await h1.update(b);

    const h2 = createChainedHasher();
    await h2.update(a);
    await h2.update(b);

    expect(toBase64Url(h1.digest()!)).toBe(toBase64Url(h2.digest()!));
  });

  it("is sensitive to chunk order", async () => {
    const a = crypto.getRandomValues(new Uint8Array(500));
    const b = crypto.getRandomValues(new Uint8Array(500));

    const h1 = createChainedHasher();
    await h1.update(a);
    await h1.update(b);

    const h2 = createChainedHasher();
    await h2.update(b);
    await h2.update(a);

    expect(toBase64Url(h1.digest()!)).not.toBe(toBase64Url(h2.digest()!));
  });

  it("matches a manual hash chain computation", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);

    const hasher = createChainedHasher();
    await hasher.update(a);
    await hasher.update(b);

    const hash0 = new Uint8Array(await crypto.subtle.digest("SHA-256", a));
    const combined = new Uint8Array(hash0.length + b.length);
    combined.set(hash0, 0);
    combined.set(b, hash0.length);
    const expected = await crypto.subtle.digest("SHA-256", combined);

    expect(toBase64Url(hasher.digest()!)).toBe(toBase64Url(expected));
  });
});
