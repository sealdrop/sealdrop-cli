#!/usr/bin/env node
// Computes checksums.txt + a signed cli-manifest.json for the binaries produced
// by build-sea.mjs across the CI build matrix. Mirrors the signing mechanics of
// apps/web/vite.config.ts's sriAndChecksums() plugin (build-manifest.json), using
// a CLI-specific keypair since this runs in a different CI provider/trust boundary.
//
// Usage: node build-release-manifest.mjs <artifacts-dir>

import { execSync } from "node:child_process";
import { createHash, createSign } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8"));

const artifactsDir = process.argv[2];
if (!artifactsDir) {
  console.error("Usage: node build-release-manifest.mjs <artifacts-dir>");
  process.exit(1);
}

const commit = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();
const built = new Date().toISOString();

const binaryNames = readdirSync(artifactsDir)
  .filter((name) => name.startsWith("sealdrop-"))
  .sort();

if (binaryNames.length === 0) {
  console.error(`No binaries matching "sealdrop-*" found in ${artifactsDir}`);
  process.exit(1);
}

const checksumLines = [
  "# SealDrop CLI release verification",
  `# version: ${pkg.version}`,
  `# commit:  ${commit}`,
  `# built:   ${built}`,
  "#",
  "# SHA-256 checksums of release binaries.",
  "# Verify: sha256sum -c checksums.txt",
  "#",
];
const manifestAssets = [];

for (const name of binaryNames) {
  const content = readFileSync(join(artifactsDir, name));
  const sha256 = createHash("sha256").update(content).digest("hex");
  manifestAssets.push({ path: name, sha256 });
  checksumLines.push(`${sha256}  ${name}`);
}

writeFileSync(join(artifactsDir, "checksums.txt"), checksumLines.join("\n") + "\n", "utf-8");
console.log("checksums.txt written");

// The signed payload is carried as a literal string, not a nested object —
// every JSON parser (jq, PowerShell's ConvertFrom-Json, etc.) returns a string
// field's bytes verbatim, with no re-serialization step that could silently
// reformat values (e.g. PowerShell's ConvertTo-Json rewrites ISO date-like
// strings, which would otherwise break verification unpredictably).
const payload = JSON.stringify({
  schema: "https://sealdrop.io/schemas/cli-manifest-v1.json",
  version: pkg.version,
  commit,
  built,
  assets: manifestAssets,
});

const out = { payload };
const signingKeyEnv = process.env["SEALDROP_CLI_MANIFEST_PRIVATE_KEY_PEM"];
if (signingKeyEnv) {
  let signingKey = signingKeyEnv.trim();
  if ((signingKey.startsWith('"') && signingKey.endsWith('"')) || (signingKey.startsWith("'") && signingKey.endsWith("'"))) {
    signingKey = signingKey.slice(1, -1).trim();
  }
  if (signingKey.includes("\\n")) signingKey = signingKey.replace(/\\n/g, "\n");
  if (!signingKey.startsWith("-----BEGIN")) signingKey = Buffer.from(signingKey, "base64").toString("utf-8");
  const signature = createSign("SHA256").update(payload).end().sign(signingKey, "base64");
  out["signature"] = { alg: "SHA256withECDSA", value: signature };
} else {
  console.warn("SEALDROP_CLI_MANIFEST_PRIVATE_KEY_PEM not set — writing an UNSIGNED manifest (local/dev run only)");
}

writeFileSync(join(artifactsDir, "cli-manifest.json"), JSON.stringify(out, null, 2) + "\n", "utf-8");
console.log("cli-manifest.json written");
