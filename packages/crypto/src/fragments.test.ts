import { describe, it, expect } from "vitest";
import { generateFileKey } from "./symmetric.js";
import { generateOwnerKeyPair } from "./asymmetric.js";
import {
  keyToFragment,
  fragmentToKey,
  privateKeyToFragment,
  fragmentToPrivateKey,
  buildSendLink,
  buildOwnerLink,
  parseSendFragment,
  parseOwnerFragment,
} from "./fragments.js";

describe("keyToFragment / fragmentToKey", () => {
  it("round-trips an AES-GCM key through base64url", async () => {
    const key = await generateFileKey();
    const fragment = await keyToFragment(key);

    expect(typeof fragment).toBe("string");
    expect(/^[A-Za-z0-9_-]+$/.test(fragment)).toBe(true);

    const imported = await fragmentToKey(fragment);
    expect(imported.type).toBe("secret");
    expect(imported.algorithm.name).toBe("AES-GCM");
  });

  it("same key always produces the same fragment", async () => {
    const key = await generateFileKey();
    const a = await keyToFragment(key);
    const b = await keyToFragment(key);
    expect(a).toBe(b);
  });

  it("different keys produce different fragments", async () => {
    const a = await generateFileKey();
    const b = await generateFileKey();
    expect(await keyToFragment(a)).not.toBe(await keyToFragment(b));
  });

  it("imported key encrypts/decrypts correctly", async () => {
    const key = await generateFileKey();
    const fragment = await keyToFragment(key);
    const imported = await fragmentToKey(fragment);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array([10, 20, 30]);

    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, imported, enc);

    expect(new Uint8Array(dec)).toEqual(data);
  });
});

describe("privateKeyToFragment / fragmentToPrivateKey", () => {
  it("round-trips an ECDH private key through base64url", async () => {
    const pair = await generateOwnerKeyPair();
    const fragment = await privateKeyToFragment(pair.privateKey);

    expect(typeof fragment).toBe("string");
    expect(/^[A-Za-z0-9_-]+$/.test(fragment)).toBe(true);

    const imported = await fragmentToPrivateKey(fragment);
    expect(imported.type).toBe("private");
    expect(imported.algorithm.name).toBe("ECDH");
  });

  it("round-tripped private key can unwrap a file key", async () => {
    const { wrapFileKey, unwrapFileKey } = await import("./asymmetric.js");
    const pair = await generateOwnerKeyPair();
    const fileKey = await generateFileKey();

    const wrapped = await wrapFileKey(fileKey, pair.publicKey);

    const privateFragment = await privateKeyToFragment(pair.privateKey);
    const importedPrivate = await fragmentToPrivateKey(privateFragment);

    const unwrapped = await unwrapFileKey(
      wrapped.wrappedKey,
      wrapped.ephemeralPublicKey,
      wrapped.wrappedKeyIv,
      importedPrivate,
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array([1, 2, 3]);
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, fileKey, data);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, unwrapped, enc);

    expect(new Uint8Array(dec)).toEqual(data);
  });
});

describe("buildSendLink / parseSendFragment", () => {
  it("parses the key fragment from a send link", () => {
    const fragment = "abc123-_xyz";
    const link = buildSendLink("fileid42", fragment);

    expect(link).toContain("/s/fileid42");
    expect(link).toContain("#key=abc123-_xyz");

    const parsed = parseSendFragment(`#key=${fragment}`);
    expect(parsed).toBe(fragment);
  });

  it("returns null when no key fragment present", () => {
    expect(parseSendFragment("")).toBeNull();
    expect(parseSendFragment("#other=xyz")).toBeNull();
  });
});

describe("buildOwnerLink / parseOwnerFragment", () => {
  it("parses the privateKey fragment from an owner link", () => {
    const fragment = "priv123-_abc";
    const link = buildOwnerLink("dropid99", fragment);

    expect(link).toContain("/r/dropid99/owner");
    expect(link).toContain("#privateKey=priv123-_abc");

    const parsed = parseOwnerFragment(`#privateKey=${fragment}`);
    expect(parsed).toBe(fragment);
  });

  it("returns null when no privateKey fragment present", () => {
    expect(parseOwnerFragment("")).toBeNull();
    expect(parseOwnerFragment("#key=xyz")).toBeNull();
  });
});
