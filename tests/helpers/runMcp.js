const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/**
 * Helper to drive the dorky MCP server for testing purposes.
 * Spawns bin/mcp.js as a real child process and talks to it over stdio
 * using the MCP client SDK, exercising the same request handlers a real
 * MCP host (e.g. Claude Desktop) would.
 *
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the server process
 * @param {Object} options.env - Extra environment variables to pass to the server
 * @returns {Promise<{callTool: Function, close: Function}>}
 *
 * @example
 * const mcp = await createMcpClient({ cwd: testDir });
 * const result = await mcp.callTool('init', { provider: 'aws' });
 * expect(result.text).toContain('initialized successfully');
 * await mcp.close();
 */
async function createMcpClient({ cwd, env = {} } = {}) {
    const mcpPath = path.resolve(__dirname, '../../bin/mcp.js');

    const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpPath],
        cwd,
        env: {
            ...process.env,
            ...env,
        },
    });

    const client = new Client({ name: 'dorky-test-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    return {
        async callTool(name, args = {}) {
            const result = await client.callTool({ name, arguments: args });
            const text = (result.content || []).map(c => c.text).join('\n');
            return { text, isError: !!result.isError };
        },
        async close() {
            await client.close();
        },
    };
}

module.exports = { createMcpClient };
