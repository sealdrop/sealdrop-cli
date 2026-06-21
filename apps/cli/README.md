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
