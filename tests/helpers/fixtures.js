const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Test Fixtures and Utilities
 * 
 * Common helpers for setting up test environments and creating test data.
 */

/**
 * Creates a temporary test directory with optional files
 * @param {Object} options - Configuration options
 * @param {Object} options.files - Object with filename keys and content values
 * @returns {string} Path to the temporary directory
 */
function createTestDir(options = {}) {
    const { files = {} } = options;

    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dorky-test-'));

    // Create specified files
    Object.entries(files).forEach(([filename, content]) => {
        const filePath = path.join(testDir, filename);
        const dir = path.dirname(filePath);

        if (dir !== testDir) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content);
    });

    return testDir;
}

/**
 * Removes a directory and all its contents
 * @param {string} dirPath - Path to the directory to remove
 */
function cleanupTestDir(dirPath) {
    if (dirPath && fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

/**
 * Creates a mock .dorky configuration directory
 * @param {string} baseDir - Base directory where .dorky should be created
 * @param {Object} config - Configuration object to write
 * @returns {string} Path to the .dorky directory
 */
function createMockDorkyConfig(baseDir, config = {}) {
    const dorkyDir = path.join(baseDir, '.dorky');
    fs.mkdirSync(dorkyDir, { recursive: true });

    const defaultConfig = {
        storage: 'aws',
        files: [],
        ...config,
    };

    fs.writeFileSync(
        path.join(dorkyDir, 'config.json'),
        JSON.stringify(defaultConfig, null, 2)
    );

    return dorkyDir;
}

/**
 * Reads the .dorky configuration from a directory
 * @param {string} baseDir - Base directory containing .dorky
 * @returns {Object|null} Configuration object or null if not found
 */
function readDorkyConfig(baseDir) {
    const configPath = path.join(baseDir, '.dorky', 'config.json');

    if (!fs.existsSync(configPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Creates sample test files with various content types
 * @param {string} baseDir - Directory where files should be created
 * @returns {Object} Object with file paths and their expected content
 */
function createSampleFiles(baseDir) {
    const files = {
        'text.txt': 'Sample text content',
        'config.json': JSON.stringify({ key: 'value' }, null, 2),
        'data.yaml': 'key: value\nlist:\n  - item1\n  - item2',
        'script.js': 'console.log("Hello from dorky");',
        'nested/deep/file.txt': 'Nested file content',
    };

    Object.entries(files).forEach(([filename, content]) => {
        const filePath = path.join(baseDir, filename);
        const dir = path.dirname(filePath);

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content);
    });

    return files;
}

/**
 * Waits for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks if a file exists and contains expected content
 * @param {string} filePath - Path to the file
 * @param {string|RegExp} expectedContent - Expected content (string or regex)
 * @returns {boolean}
 */
function fileContains(filePath, expectedContent) {
    if (!fs.existsSync(filePath)) {
        return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (expectedContent instanceof RegExp) {
        return expectedContent.test(content);
    }

    return content.includes(expectedContent);
}

module.exports = {
    createTestDir,
    cleanupTestDir,
    createMockDorkyConfig,
    readDorkyConfig,
    createSampleFiles,
    sleep,
    fileContains,
};
