import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Dorky CLI - E2E Tests', () => {
    let testDir;

    beforeEach(() => {
        // Create a temporary directory for each test
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dorky-test-'));
    });

    afterEach(() => {
        // Clean up the temporary directory
        if (testDir && fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('Help and Version', () => {
        it('should display help when --help flag is used', async () => {
            const result = await runCli(['--help']);

            expect(result.exitCode).toBe(0);
            expect(result.all).toContain('dorky');
            expect(result.all).toContain('Options:');
        });

        it('should display help when no arguments are provided', async () => {
            const result = await runCli([]);

            expect(result.exitCode).toBe(0);
            expect(result.all).toContain('dorky');
        });

        it('should display version when --version flag is used', async () => {
            const result = await runCli(['--version']);

            expect(result.exitCode).toBe(0);
            // The version should match the package.json version
            expect(result.all).toMatch(/\d+\.\d+\.\d+/);
        });
    });

    // describe('Init Command', () => {
    //     it('should initialize a dorky project with AWS', async () => {
    //         const result = await runCli(['--init', 'aws'], { cwd: testDir });

    //         // Check if .dorky directory was created
    //         const dorkyDir = path.join(testDir, '.dorky');
    //         expect(fs.existsSync(dorkyDir)).toBe(true);
    //     });

    //     it('should initialize a dorky project with Google Drive', async () => {
    //         const result = await runCli(['--init', 'google-drive'], { cwd: testDir });

    //         // Check if .dorky directory was created
    //         const dorkyDir = path.join(testDir, '.dorky');
    //         expect(fs.existsSync(dorkyDir)).toBe(true);
    //     });

    //     it('should fail with invalid storage provider', async () => {
    //         const result = await runCli(['--init', 'invalid-provider'], { cwd: testDir });

    //         // Should indicate an error or show help
    //         expect(result.exitCode).not.toBe(0);
    //     });
    // });

    // describe('List Command', () => {
    //     it('should list files when --list flag is used', async () => {
    //         // First initialize a project
    //         await runCli(['--init', 'aws'], { cwd: testDir });

    //         // Then list files
    //         const result = await runCli(['--list'], { cwd: testDir });

    //         // Should execute without critical errors
    //         expect(result.exitCode).toBe(0);
    //     });
    // });

    // describe('Add Command', () => {
    //     it('should add files to the dorky project', async () => {
    //         // Initialize project
    //         await runCli(['--init', 'aws'], { cwd: testDir });

    //         // Create a test file
    //         const testFile = path.join(testDir, 'test.txt');
    //         fs.writeFileSync(testFile, 'test content');

    //         // Add the file
    //         const result = await runCli(['--add', 'test.txt'], { cwd: testDir });

    //         // Should complete successfully
    //         expect(result.exitCode).toBe(0);
    //     });

    //     it('should add multiple files at once', async () => {
    //         // Initialize project
    //         await runCli(['--init', 'aws'], { cwd: testDir });

    //         // Create test files
    //         fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content 1');
    //         fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content 2');

    //         // Add multiple files
    //         const result = await runCli(['--add', 'file1.txt', 'file2.txt'], { cwd: testDir });

    //         expect(result.exitCode).toBe(0);
    //     });
    // });

    // describe('Remove Command', () => {
    //     it('should remove files from the dorky project', async () => {
    //         // Initialize and add a file first
    //         await runCli(['--init', 'aws'], { cwd: testDir });

    //         const testFile = path.join(testDir, 'test.txt');
    //         fs.writeFileSync(testFile, 'test content');
    //         await runCli(['--add', 'test.txt'], { cwd: testDir });

    //         // Remove the file
    //         const result = await runCli(['--rm', 'test.txt'], { cwd: testDir });

    //         expect(result.exitCode).toBe(0);
    //     });
    // });

    // describe('Error Handling', () => {
    //     it('should handle commands without initialization gracefully', async () => {
    //         // Try to list without initializing
    //         const result = await runCli(['--list'], { cwd: testDir });

    //         // Should either show an error or handle gracefully
    //         // (actual behavior depends on implementation)
    //     });

    //     it('should handle invalid command combinations', async () => {
    //         const result = await runCli(['--init', 'aws', '--list'], { cwd: testDir });

    //         // Should handle multiple commands appropriately
    //     });
    // });
});
