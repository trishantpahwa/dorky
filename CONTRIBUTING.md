# Contributing to dorky

First off, thank you for considering contributing to dorky! It's people like you that make dorky such a great tool for the DevOps community.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

- **Check if the bug has already been reported.** Search the [issues list](https://github.com/trishantpahwa/dorky/issues).
- **Use the Bug Report template.** provide as much information as possible.
- **Provide a reproducible example.** This helps us fix the issue faster.

### Suggesting Features

- **Check if the feature has already been requested.**
- **Explain why the feature would be useful.**
- **Be as detailed as possible.**

### Your First Code Contribution

Unsure where to begin? Look for issues labeled `good first issue` or `help wanted`. Our [automated setup](.github/workflows/issue-auto-respond.yml) will even assign it to you automatically if you comment on it!

1. **Fork the repository.**
2. **Clone your fork.**
3. **Create a new branch** for your fix or feature.
4. **Make your changes.**
5. **Run tests** using `npm test`.
6. **Commit your changes.** We follow simple commit messages.
7. **Push to your fork.**
8. **Submit a Pull Request.**

## Development Setup

```bash
# Clone the repository
git clone https://github.com/trishantpahwa/dorky.git
cd dorky

# Install dependencies
npm install

# Run the CLI locally
node bin/index.js --help

# Run tests
npm test
```

## Pull Request Process

1. Ensure any install or build dependencies are removed before the end of the layer when doing a build.
2. Update the README.md with details of changes to the interface, this includes new environment variables, exposed ports, useful file locations and container parameters.
3. You may merge the Pull Request in once you have the sign-off of two other developers, or if you do not have permission to do that, you may request the second reviewer to merge it for you.

## Need Help?

Feel free to open an issue or reach out to the maintainers!
