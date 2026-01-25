# dorky

```
     __            __
 .--|  .-----.----|  |--.--.--.
 |  _  |  _  |   _|    <|  |  |
 |_____|_____|__| |__|__|___  |
                        |_____|
```

[`DevOps Records Keeper`](https://dorky.trishantpahwa.me/)

[![dorky npm](https://img.shields.io/npm/v/dorky.svg?logo=npm)](https://npmjs.com/package/dorky)

![Made with love in India](https://madewithlove.now.sh/in?heart=true&template=for-the-badge) `&& ` ![javascript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)

## Overview

Manage sensitive project files like environment variables, configuration files, and API keys without committing them to public version control. **dorky** securely stores your sensitive files on AWS S3 or Google Drive, making them accessible to authorized team members.

## Installation

```bash
npm install -g dorky
```

Or use with npx:

```bash
npx dorky --help
```

## Prerequisites

### AWS S3

1. Create an S3 bucket in your AWS account
2. Create an IAM user with programmatic access
3. Attach the following IAM policy to the user (replace `your-bucket-name` with your actual bucket name):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```

4. Generate AWS credentials (Access Key ID and Secret Access Key) for the IAM user
5. Set up environment variables:

```bash
export AWS_ACCESS_KEY="your-access-key"
export AWS_SECRET_KEY="your-secret-key"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket-name"
```

### Google Drive

1. Create a Google Cloud Project
2. Enable Google Drive API
3. Download OAuth 2.0 credentials
4. Save credentials as `google-drive-credentials.json` in your project root

## Quick Start

### AWS S3 Setup

![Dorky Usage](dorky-usage-aws.svg "Dorky usage")

```bash
# Navigate to your project
cd your-project

# Initialize dorky with AWS
dorky --init aws

# List files that can be added
dorky --list

# Add sensitive files
dorky --add .env config.yml

# Push to S3
dorky --push
```

### Google Drive Setup

![Dorky Usage](dorky-usage-google-drive.svg "Dorky usage")

```bash
# Navigate to your project
cd your-project

# Initialize dorky with Google Drive
dorky --init google-drive

# Authenticate (browser window will open)
# Follow the OAuth flow

# List files that can be added
dorky --list

# Add sensitive files
dorky --add .env secrets.json

# Push to Google Drive
dorky --push
```

## Usage

### Initialize a Project

```bash
# For AWS S3
dorky --init aws

# For Google Drive
dorky --init google-drive
```

This creates:

- `.dorky/` folder with metadata and credentials
- `.dorkyignore` file for exclusion patterns
- Updates `.gitignore` to protect credentials

### List Files

```bash
# List local files (shows what can be added)
dorky --list

# List remote files (shows what's in storage)
dorky --list remote
```

### Add Files to Stage

```bash
# Add single file
dorky --add .env

# Add multiple files
dorky --add .env config.yml secrets.json

# Add files with specific patterns
dorky --add .env.production .env.staging
```

### Remove Files from Stage

```bash
# Remove single file
dorky --rm .env

# Remove multiple files
dorky --rm .env config.yml
```

### Push Files to Storage

```bash
# Push all staged files
dorky --push
```

This command:

- Uploads new files
- Updates modified files (based on hash comparison)
- Skips unchanged files

### Pull Files from Storage

```bash
# Pull all tracked files
dorky --pull
```

This command:

- Downloads all tracked files from storage
- Creates necessary directories
- Overwrites local files

## Configuration

### .dorkyignore

Exclude files and directories from dorky scanning:

```
node_modules/
.git/
dist/
build/
*.log
coverage/
```

### Directory Structure

After initialization:

```
your-project/
├── .dorky/
│   ├── credentials.json    # Storage credentials (auto-ignored by git)
│   └── metadata.json       # Tracked files metadata
├── .dorkyignore           # Exclusion patterns
└── .gitignore             # Updated automatically
```

## Common Workflows

### Workflow 1: Initial Setup for Team

```bash
# Team lead initializes and pushes files
dorky --init aws
dorky --add .env config/secrets.yml
dorky --push

# Team members pull files
git clone <repository>
cd <repository>
# Set up AWS credentials in environment
dorky --pull
```

### Workflow 2: Update Sensitive Configuration

```bash
# Modify your .env file locally
vim .env

# Add updated file
dorky --add .env

# Push changes
dorky --push
```

### Workflow 3: Clean Up Tracked Files

```bash
# Remove from staging
dorky --rm old-config.yml

# Push to remove from remote
dorky --push
```

## Examples

### Example 1: Managing Environment Files

```bash
# Initialize with AWS
dorky --init aws

# Add environment files for different stages
dorky --add .env.development .env.staging .env.production

# Check what will be uploaded
dorky --list

# Upload to S3
dorky --push

# View remote files
dorky --list remote
```

### Example 2: Managing API Keys

```bash
# Initialize with Google Drive
dorky --init google-drive

# Add API key files
dorky --add config/api-keys.json secrets/tokens.yml

# Push to Google Drive
dorky --push

# On another machine, pull the files
dorky --pull
```

## Features

- ✅ AWS S3 storage integration
- ✅ Google Drive storage integration
- ✅ List remote files in dorky bucket
- ✅ Auto detect .env and .config files
- ✅ Automatic .gitignore updates to ignore credentials
- ✅ Handle reauthentication for Google Drive
- ✅ Token refresh for Google Drive authentication
- ✅ Ignore dorky files in dorky itself
- ✅ File hash validation to skip unchanged files
- ✅ Mime-type detection for file uploads
- ✅ Recursive folder creation on pull

## How It Works

1. **Initialization**: Creates `.dorky/` folder with metadata and credentials
2. **File Tracking**: Maintains a hash-based registry of files in `metadata.json`
3. **Smart Uploads**: Only uploads files that have changed (based on MD5 hash)
4. **Auto-detection**: Highlights `.env` and `.config` files during listing
5. **Security**: Automatically updates `.gitignore` to protect credentials

## Security Best Practices

- ✅ Never commit `.dorky/credentials.json` to version control
- ✅ Use environment variables for AWS credentials
- ✅ Rotate access keys regularly
- ✅ Use IAM roles with minimal required permissions
- ✅ Review `.dorkyignore` before adding files
- ✅ Keep `google-drive-credentials.json` secure

## Troubleshooting

### AWS S3 Issues

**Error: Missing credentials**

```bash
# Set environment variables
export AWS_ACCESS_KEY="your-key"
export AWS_SECRET_KEY="your-secret"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket"
```

### Google Drive Issues

**Error: Invalid credentials**

```bash
# Re-authenticate
dorky --init google-drive
```

**Error: Token expired**

- dorky automatically refreshes tokens
- If issues persist, delete `.dorky/credentials.json` and re-authenticate

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License - see [LICENSE](LICENSE) file for details.

## Support

- 📦 [npm package](https://npmjs.com/package/dorky)
- 🐛 [Report issues](https://github.com/trishantpahwa/dorky/issues)
- 🌐 [Website](https://dorky.trishantpahwa.me/)

## Roadmap

- [x] Update README with AWS IAM policy (bug fix release)
- [*] Handle invalid access token for Google Drive and AWS (edge cases)
- [ ] rm + push should delete file from storage (minor release)
- [ ] Uninitialize dorky setup (Bug fix release)
- [ ] Extension for VS Code to list and highlight them like git (Major release)
- [ ] MCP server (Minor release)
- [ ] Encryption of files (Minor release)
- [ ] Add stages for variables (Major release)
- [ ] Migrate dorky project to another storage (partially implemented)

