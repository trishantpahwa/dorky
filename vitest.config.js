import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Use Node.js environment for CLI testing
        environment: 'node',

        // Increase timeout for CLI E2E tests
        testTimeout: 60000,

        // Coverage configuration
        coverage: {
            provider: 'c8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['bin/**/*.js'],
            exclude: [
                'coverage/**',
                'tests/**',
                'test-for-later/**',
                'web-app/**',
                'node_modules/**',
                '**/*.config.js',
            ],
            all: true,
        },

        // Include test files
        include: ['tests/**/*.test.js'],

        // Global test timeout
        hookTimeout: 10000,

        // Disable threads for better CLI subprocess handling
        threads: false,

        // Bail on first test failure (optional, can be removed)
        bail: 0,
    },
});
