# Contributing to dorky

Thank you for helping improve dorky — a git-style CLI that keeps secrets out of version control by syncing them to AWS S3 or Google Drive.

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md). Report concerns via [repo issues](https://github.com/trishantpahwa/dorky/issues).

## First-time contributors

1. Browse [good first issues](https://github.com/trishantpahwa/dorky/labels/good%20first%20issue) and [help wanted](https://github.com/trishantpahwa/dorky/labels/help%20wanted).
2. Comment on an issue if you want to claim it (the repo may auto-respond / assign).
3. Fork → branch → PR with `Closes #…` in the description.

## Development setup

**Node.js:** use a current LTS (18+ recommended).

```bash
git clone https://github.com/<you>/dorky.git
cd dorky
npm install
```

### Run locally

```bash
# CLI
node bin/index.js --help

# MCP server
node bin/mcp.js
```

### Tests

```bash
npm test              # full suite (includes e2e; can be slow)
npm run test:unit     # fast unit tests under tests/unit/
npm run test:e2e      # e2e only
npm run test:coverage # coverage report
```

## Golden rule: keep binaries in sync

Until shared provider code is fully extracted (`lib/`), **behavior that lives in both** `bin/index.js` and `bin/mcp.js` should be updated in **both** files (or moved into `lib/` and required from both).

Examples: Google Drive query helpers, cloud SDK loading, shared path/metadata helpers.

## Pull requests

- Prefer small, focused PRs that match one issue.
- Use the PR template checklist.
- Do not commit secrets, credentials, or real `.env` files.
- For user-facing CLI changes, update the README.

## Reporting bugs / features

Use the issue templates under **New issue** (bug report includes dorky version, provider, OS, and repro steps).

## Need help?

Open an issue — maintainers and other contributors will help where they can.
