#!/usr/bin/env node
// Builds a standalone single-executable binary for the host's own OS/arch using
// Node's SEA feature (https://nodejs.org/api/single-executable-applications.html).
// Run natively per target platform in CI — no cross-compilation.

import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inject } from "postject";

const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8"));

const platform = process.platform;
const arch = process.arch;
const osNames = { linux: "linux", darwin: "macos", win32: "windows" };
const osName = osNames[platform];
if (!osName) throw new Error(`unsupported platform for SEA build: ${platform}`);
if (arch !== "x64" && arch !== "arm64") throw new Error(`unsupported arch for SEA build: ${arch}`);

const exeSuffix = platform === "win32" ? ".exe" : "";
const outDir = join(cliDir, "dist-sea");
const bundlePath = join(outDir, "bundle.cjs");
const blobPath = join(outDir, "sea-prep.blob");
const seaConfigPath = join(outDir, "sea-config.json");
const outputName = `sealdrop-${pkg.version}-${osName}-${arch}${exeSuffix}`;
const outputPath = join(outDir, outputName);

mkdirSync(outDir, { recursive: true });

// Bundle to CJS (not the npm package's ESM build) so the SEA entry has no
// ambiguity around Node SEA's ESM support — and qrcode must be inlined here
// since the binary has to be fully self-contained.
console.log("[build-sea] bundling CLI entry (CJS, qrcode inlined)...");
await esbuild.build({
  entryPoints: [join(cliDir, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: bundlePath,
});

writeFileSync(
  seaConfigPath,
  JSON.stringify(
    { main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true },
    null,
    2,
  ),
);

console.log("[build-sea] generating SEA blob...");
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], { stdio: "inherit" });

console.log(`[build-sea] copying node binary -> dist-sea/${outputName}`);
copyFileSync(process.execPath, outputPath);
chmodSync(outputPath, 0o755);

if (platform === "darwin") {
  // The copied node binary still carries its original code signature, which
  // becomes invalid once postject modifies the binary below — must strip it first.
  console.log("[build-sea] removing existing code signature (macOS)...");
  execFileSync("codesign", ["--remove-signature", outputPath], { stdio: "inherit" });
} else if (platform === "win32") {
  try {
    execFileSync("signtool", ["remove", "/s", outputPath], { stdio: "inherit" });
  } catch {
    // node.exe may already be unsigned in this environment — non-fatal.
  }
}

console.log("[build-sea] injecting blob with postject...");
// Use postject's programmatic API directly rather than shelling out to its
// CLI via npx — npx.cmd requires shell interpretation on Windows, which
// execFileSync(..., {shell: false}) can't do (fails with EINVAL there).
await inject(outputPath, "NODE_SEA_BLOB", readFileSync(blobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  machoSegmentName: platform === "darwin" ? "NODE_SEA" : undefined,
});

if (platform === "darwin") {
  console.log("[build-sea] ad-hoc signing (avoids Gatekeeper hard block, not the first-run warning)...");
  execFileSync("codesign", ["--sign", "-", outputPath], { stdio: "inherit" });
}

console.log(`[build-sea] done: dist-sea/${outputName}`);
