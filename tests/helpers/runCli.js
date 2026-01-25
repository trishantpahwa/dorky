const execa = require('execa');
const path = require('path');

/**
 * Helper function to run the dorky CLI for testing purposes.
 * This uses execa to spawn a child process and execute the CLI,
 * allowing c8 to properly collect coverage data.
 * 
 * @param {string[]} args - Command line arguments to pass to the CLI
 * @param {Object} options - Options for the CLI execution
 * @param {string} options.cwd - Working directory for the command (defaults to temp directory)
 * @param {Object} options.env - Environment variables to pass to the CLI
 * @param {boolean} options.reject - Whether to reject on non-zero exit (default: false)
 * @param {string} options.input - Input to pass to stdin
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 * 
 * @example
 * // Test the help command
 * const result = await runCli(['--help']);
 * expect(result.stdout).toContain('dorky');
 * 
 * @example
 * // Test with environment variables
 * const result = await runCli(['--list'], { 
 *   env: { AWS_REGION: 'us-east-1' }
 * });
 */
async function runCli(args = [], options = {}) {
    const {
        cwd = process.cwd(),
        env = {},
        reject = false,
        input,
        ...execaOptions
    } = options;

    // Path to the CLI entry point
    const cliPath = path.resolve(__dirname, '../../bin/index.js');

    try {
        const result = await execa('node', [cliPath, ...args], {
            cwd,
            env: {
                ...process.env,
                ...env,
                // Ensure colors are disabled in tests for easier assertion
                NO_COLOR: '1',
                FORCE_COLOR: '0',
            },
            reject,
            input,
            all: true,
            ...execaOptions,
        });

        return {
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            exitCode: result.exitCode || 0,
            all: result.all || '',
        };
    } catch (error) {
        // If reject is false, we still want to return the result
        return {
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            exitCode: error.exitCode || 1,
            all: error.all || '',
            error,
        };
    }
}

module.exports = { runCli };
