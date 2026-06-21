# SealDrop CLI

End-to-end encrypted file transfer from the terminal, fully compatible with [sealdrop.io](https://sealdrop.io). Files and metadata are encrypted locally; the encryption key stays in the URL fragment and is never sent to the server.

Requires Node.js 22 or newer.

Source code is available at [github.com/sealdrop/sealdrop-cli](https://github.com/sealdrop/sealdrop-cli) under the MIT license.

## Install

```bash
npm install --global @sealdrop/cli
sealdrop --version
```

You can also run it without installing:

```bash
npx --package @sealdrop/cli sealdrop --help
```

### Install without Node.js

Standalone binaries are also published with every release — no Node.js or npm required.

macOS / Linux:

```bash
curl -fsSL https://sealdrop.io/install-cli.sh | bash
```

Windows (PowerShell 7+):

```powershell
irm https://sealdrop.io/install-cli.ps1 | iex
```

Both scripts download a release binary and a signed `cli-manifest.json`, verify the signature against a pinned public key (also published at [sealdrop.io/cli-manifest-public.pem](https://sealdrop.io/cli-manifest-public.pem)), then verify the binary's checksum — and only install if both checks pass. Neither uses `sudo`/admin elevation or edits shell config files. Don't want to pipe a script straight into your shell? Fetch and read it first:

```bash
curl -fsSL https://sealdrop.io/install-cli.sh
```

Or skip the script entirely: download a binary and `cli-manifest.json` directly from the [GitHub releases page](https://github.com/sealdrop/sealdrop-cli/releases), verify with `openssl` and `sha256sum`/`shasum`, and place the binary on your `PATH` yourself.

The Windows installer requires PowerShell 7+ (`winget install Microsoft.PowerShell` if you're on the PowerShell 5.1 that ships by default) — it relies on .NET crypto APIs that aren't available in 5.1.

## Send

```bash
sealdrop send ./document.pdf
sealdrop send ./document.pdf --expires 3d --qr
sealdrop send ./document.pdf --access-code --handoff
```

Send links use open-once expiry, standard size padding, and include a deletion credential by default. Available expiry values are `open-once`, `1h`, `today`, `3d`, and `7d`; padding levels are `standard`, `enhanced`, and `maximum`.

For passphrase protection, use a hidden prompt or read the secret from a file/stdin instead of placing it in shell history:

```bash
sealdrop send ./document.pdf --passphrase
printf '%s' "$SEALDROP_PASSPHRASE" |
  sealdrop send ./document.pdf --passphrase --passphrase-file -
```

When sealdrop.io has bot protection enabled, the CLI opens a browser for a one-time Turnstile authorization. No persistent API credential is stored.

## Download

Always quote links so the shell preserves the `#key=` fragment:

```bash
sealdrop download 'https://sealdrop.io/s/...#key=...'
sealdrop download 'https://sealdrop.io/s/...#key=...' --output ./received.pdf
```

Downloads are streamed to a temporary file, decrypted locally, and renamed only after the encrypted metadata and integrity digest verify successfully.

## Handoff and deletion

```bash
sealdrop handoff 'SHARE_URL' --qr
sealdrop delete 'DELETE_URL'
```

Handoff codes expire after ten minutes and can be consumed once. Delete tokens are read from the URL fragment and sent to the API only in a request header.

## Custom servers and automation

Use `--server` or `SEALDROP_SERVER` to target another compatible deployment. `--json` keeps stdout machine-readable; progress and authorization instructions use stderr.

```bash
SEALDROP_SERVER=https://drop.example.com sealdrop send ./archive.tar --json
```

Run `sealdrop help` for the complete command reference.
