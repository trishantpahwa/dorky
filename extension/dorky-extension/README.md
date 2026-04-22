# dorky-extension

A VS Code extension for [dorky](https://dorky.trishantpahwa.me/) — DevOps Records Keeper. Manage sensitive project files (`.env`, API keys, config files) stored on AWS S3 or Google Drive directly from the VS Code sidebar.

> **CLI tool:** This extension is a graphical interface for the [`dorky` CLI](https://npmjs.com/package/dorky). You can use the CLI independently for terminal-based workflows or CI/CD pipelines:
>
> ```bash
> npm install -g dorky
> ```
>
> See the [dorky CLI documentation](https://github.com/trishantpahwa/dorky#readme) for the full list of commands.

## Features

- **Sidebar panel** showing staged and uploaded files at a glance
- **Initialize** a dorky project with AWS S3 or Google Drive
- **Stage files** using a file picker dialog
- **Unstage files** with a single inline click in the tree
- **Push** staged files to remote storage
- **Pull** tracked files from remote storage
- **List remote** files in the output channel
- **Destroy** the project (removes remote files and local config)
- Context-aware toolbar — actions only appear when relevant

## Requirements

- A dorky-compatible storage backend: **AWS S3** or **Google Drive**

### AWS S3

Set up the following environment variables before initializing:

```bash
export AWS_ACCESS_KEY="your-access-key"
export AWS_SECRET_KEY="your-secret-key"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket-name"
```

The extension will prompt you to enter these values during initialization.

### Google Drive

Place your OAuth 2.0 credentials file at the workspace root before initializing:

```
your-project/
└── google-drive-credentials.json
```

A browser window will open for OAuth authentication when you initialize.

## Getting Started

1. Open your project folder in VS Code
2. Click the **Dorky** icon in the activity bar
3. Click **Initialize Project** in the welcome view
4. Select a storage backend (`aws` or `google-drive`) and follow the prompts

## Sidebar

The Dorky panel appears in the activity bar. Once initialized it shows:

```
DORKY  FILES          [+] [↑] [↓] [≡] [↺] [🗑]
  aws  storage
  ▼ Staged  2 file(s)
      .env                              [−]
      config.json                       [−]
  ▼ Uploaded  1 file(s)
      .env
```

### Toolbar Actions

| Icon | Command | Description |
|------|---------|-------------|
| `+` | Add Files | Open file picker to stage files |
| `↑` | Push | Upload staged files to remote storage |
| `↓` | Pull | Download tracked files from remote storage |
| `≡` | List Remote | Show remote files in the Dorky output channel |
| `↺` | Refresh | Refresh the sidebar tree |
| `🗑` | Destroy Project | Delete remote files and local dorky config |

### Inline Actions

- Click `−` next to any staged file to instantly unstage it

## Workflow

```
Initialize → Add Files → Push → (share project) → Pull
```

1. **Initialize** — creates `.dorky/` with credentials and metadata, updates `.gitignore`
2. **Add** — stage files you want to track (file picker, multi-select)
3. **Push** — uploads new/changed files; removes files that were unstaged
4. **Pull** — downloads all tracked files on another machine

## Output

All operation logs appear in the **Dorky** output channel (`View → Output → Dorky`).

## Security

- `.dorky/credentials.json` is automatically added to `.gitignore`
- Credentials are stored locally in the `.dorky/` folder and never committed
- Google Drive tokens are refreshed automatically; re-authentication is triggered if the token is invalid

## CLI Tool

This extension is a graphical companion to the [`dorky` CLI](https://npmjs.com/package/dorky). Use the CLI directly for terminal-based workflows or CI/CD pipelines:

```bash
npm install -g dorky
```

Full documentation: [github.com/trishantpahwa/dorky](https://github.com/trishantpahwa/dorky#readme)

## Release Notes

### 0.0.1

Initial release — full sidebar UI with AWS S3 and Google Drive support.
