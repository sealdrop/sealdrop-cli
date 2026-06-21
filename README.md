# SealDrop CLI

The open-source command-line client for [SealDrop](https://sealdrop.io). It
encrypts and decrypts files locally and is compatible with the SealDrop web
application.

## Install

```bash
npm install --global @sealdrop/cli
sealdrop --help
```

Node.js 22 or newer is required. No Node.js? Standalone binaries are attached
to every [release](https://github.com/sealdrop/sealdrop-cli/releases), with a
signed checksum manifest (`cli-manifest.json`, verified against the public key
at [sealdrop.io/cli-manifest-public.pem](https://sealdrop.io/cli-manifest-public.pem)):

```bash
curl -fsSL https://sealdrop.io/install-cli.sh | bash    # macOS / Linux
irm https://sealdrop.io/install-cli.ps1 | iex            # Windows (PowerShell 7+)
```

See [`apps/cli/README.md`](apps/cli/README.md) for commands and usage examples.

## Repository layout

- `apps/cli` — command parsing, streaming transfers, and terminal output
- `packages/crypto` — Web Crypto utilities shared with the browser client
- `packages/shared` — protocol types, validation schemas, and expiry presets

The shared packages are included so this repository contains the complete
preferred source needed to build the published CLI package.

## Build and test

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
node apps/cli/dist/index.js --version
```

## Security

Encryption keys remain in URL fragments and are not sent to the server. See
the [SealDrop security model](https://sealdrop.io/security) for the protocol,
trust assumptions, and disclosure process.

## License

MIT — see [`LICENSE`](LICENSE).
