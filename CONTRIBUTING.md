# Contributing

Issues and focused pull requests are welcome. For security reports, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## Development

Node.js 22 or newer and pnpm 11 or newer are required.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Keep changes scoped, add tests for behavior changes, and never add real file
links, encryption keys, URL fragments, credentials, or plaintext user data to
tests or logs. Pull requests must pass the repository's `verify` CI check.

By contributing, you agree that your contribution is licensed under the MIT
license used by this repository.
