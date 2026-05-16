# AGENTS.md

Context for LLMs and coding agents working in this repository.

## Project Overview

**dorky** — "DevOps Records Keeper". A CLI tool that stores sensitive project files (`.env`, configs, API keys) on remote storage (AWS S3 or Google Drive) instead of committing them to version control. Modeled loosely on `git` semantics: `add` / `rm` / `push` / `pull` / `log` / `checkout`.

- Package name: `dorky` (npm)
- Language: JavaScript (CommonJS, Node.js)
- License: ISC
- Homepage: https://dorky.trishantpahwa.me/
- Repository: https://github.com/trishantpahwa/dorky

## Repository Layout

```
dorky/
├── bin/
│   ├── index.js          # Main CLI entrypoint (`dorky` binary)
│   └── mcp.js            # MCP server entrypoint (`dorky-mcp` binary)
├── extension/
│   └── dorky-extension/  # VS Code extension (separate package, separate version)
├── web-app/              # Marketing/docs React site (CRA + Tailwind)
├── tests/
│   ├── e2e/cli.test.js   # End-to-end CLI tests (Vitest)
│   └── helpers/          # Test fixtures + CLI runner helpers
├── .dorky/               # Local dorky state (metadata, credentials, history)
├── .dorkyignore          # Files dorky should skip when scanning
├── .mcp.json             # MCP server config for local dev
├── vitest.config.js
└── package.json
```

The three main artifacts (`dorky` CLI, `dorky-mcp` server, `dorky-extension`) are versioned independently — keep that in mind before bumping versions.

## Binaries / Entrypoints

| Binary      | File           | Purpose                                                |
| ----------- | -------------- | ------------------------------------------------------ |
| `dorky`     | `bin/index.js` | CLI tool — `yargs`-driven, handles all user commands   |
| `dorky-mcp` | `bin/mcp.js`   | MCP stdio server exposing dorky commands as MCP tools  |

Both files share substantial logic (constants, helpers, S3 + Google Drive clients). Changes to one usually need mirroring in the other — there is no shared library yet.

## Key Constants (in both `bin/index.js` and `bin/mcp.js`)

- `DORKY_DIR = ".dorky"`
- `METADATA_PATH = .dorky/metadata.json` — tracks `stage-1-files` and `uploaded-files` (path → md5 hash)
- `CREDENTIALS_PATH = .dorky/credentials.json` — storage credentials, git-ignored
- `HISTORY_PATH = .dorky/history.json` — push commit log
- `GD_CREDENTIALS_PATH = ../google-drive-credentials.json` — relative to `bin/`
- `SCOPES = ['https://www.googleapis.com/auth/drive']`

Remote history snapshots live at `<project>/.dorky-history/<commit-id>/` in the remote bucket/folder.

## Commands (CLI)

| Flag                 | Alias | Purpose                                       |
| -------------------- | ----- | --------------------------------------------- |
| `--init <provider>`  | `-i`  | Initialize project (`aws` or `google-drive`)  |
| `--list [remote]`    | `-l`  | List local stageable / remote files           |
| `--add <files...>`   | `-a`  | Stage files                                   |
| `--rm <files...>`    | `-r`  | Unstage files                                 |
| `--push`             | `-ph` | Upload staged files, commit snapshot          |
| `--pull`             | `-pl` | Download all tracked files                    |
| `--log`              | `-lg` | Show push history                             |
| `--checkout <id>`    | `-co` | Restore files from a commit (prefix match OK) |
| `--migrate <target>` | `-m`  | Migrate to another storage (partial)          |
| `--destroy`          | `-d`  | Delete local state + remote files             |

## MCP Tools (exposed by `dorky-mcp`)

`init`, `list`, `add`, `remove`, `push`, `pull`, `log`, `checkout`, `destroy` — names match CLI flags. MCP server expects storage credentials via env vars (`AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_REGION`, `BUCKET_NAME` for S3).

## Conventions

- **CommonJS only** in `bin/` — `require` / `module.exports`, no ESM there.
- **Vitest config is ESM** (`vitest.config.js` uses `import`/`export`).
- **Path normalization**: paths are stored POSIX-style in metadata/history. Use the `toPosix()` helper before writing to JSON and `normalizeKeys()` when reading.
- **File identity** is MD5 hash of contents (`md5` package) — used to skip unchanged files on push.
- **EOL**: Code uses `\r\n` on Darwin, `\n` elsewhere — see top of `bin/index.js`. Be careful when editing files dorky writes.
- **No TypeScript** in source despite `typescript` being a devDependency.
- **Error UX**: CLI uses `chalk` for colored output; MCP throws/returns structured errors instead of `process.exit`.

## Running & Testing

```bash
# Run CLI locally
node bin/index.js --help
# or
npm start

# Run MCP server
node bin/mcp.js

# Tests
npm test               # vitest run
npm run test:watch
npm run test:unit
npm run test:e2e
npm run test:coverage  # uses c8
```

E2E tests spawn the CLI as a subprocess via `tests/helpers/runCli.js` and use fixtures from `tests/helpers/fixtures.js`. They are slow — `testTimeout` is 60s. Vitest is configured with `threads: false` so subprocess handling stays sane.

## Environment Variables

For AWS S3 workflows (CLI, MCP, and extension all read these):

- `AWS_ACCESS_KEY`
- `AWS_SECRET_KEY`
- `AWS_REGION`
- `BUCKET_NAME`

For Google Drive: `google-drive-credentials.json` (OAuth client) must exist at the repo root, alongside `package.json`. Per-project user tokens are written to `.dorky/credentials.json` after `dorky --init google-drive`.

## Things to Watch Out For

- **Never commit** `.dorky/credentials.json`, `google-drive-credentials.json`, or `.env`. The CLI auto-appends these patterns to `.gitignore` on init — don't undo that.
- **`bin/index.js` and `bin/mcp.js` are intentionally duplicated.** Until they are refactored to share a module, mirror logic changes between them or behavior will drift.
- **The `extension/dorky-extension/` subproject has its own `node_modules` and its own version.** Don't bump it implicitly when bumping the root package.
- **Versioning history** (from recent commits): root `dorky` is at `4.1.4`, extension at `0.0.10` — they are bumped separately, often in the same commit but with separate intent.
- **`--migrate` is partially implemented.** Don't assume it works end-to-end.
- **Push is hash-aware**: if staged state matches the latest commit, push is a no-op. Tests need to account for this.
- **History entries** are mutated through `normalizeKeys` on read — if you bypass `readHistory()`, you risk Windows-style backslash keys leaking in.

## Out-of-Scope for Most Tasks

- `web-app/` is a separate React marketing site (CRA + Tailwind). Unrelated to the CLI; don't touch unless explicitly asked.
- `coverage/` is generated; never edit.
- `node_modules/` — never edit; reinstall instead.

## Where to Add Things

- New CLI flag → `bin/index.js` (yargs block near the top) + mirror as an MCP tool in `bin/mcp.js`.
- New storage provider → both `bin/index.js` and `bin/mcp.js` need provider branches; update `--init` validation and the metadata `provider` field.
- New tests → `tests/e2e/` (subprocess style) using helpers in `tests/helpers/`.
- README updates for user-facing changes; this file (AGENTS.md) for agent/dev-facing context.
