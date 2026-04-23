import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "../helpers/runCli.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

describe("Dorky CLI - E2E Tests", () => {
    let testDir;

    beforeEach(() => {
        // Create a temporary directory for each test
        testDir = fs.mkdtempSync(path.join(process.cwd(), "dorky-test-"));
    });

    afterEach(() => {
        // Clean up the temporary directory
        if (testDir && fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("Help and Version", () => {
        it("should display help when --help flag is used", async () => {
            const result = await runCli(["--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("dorky");
            expect(result.all).toContain("Options:");
        });

        it("should display help when no arguments are provided", async () => {
            const result = await runCli([]);

            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("dorky");
        });

        it("should display version when --version flag is used", async () => {
            const result = await runCli(["--version"]);

            expect(result.exitCode).toBe(0);
            // The version should match the package.json version
            expect(result.all).toMatch(/\d+\.\d+\.\d+/);
        });
    });

    describe("Fail safes", () => {

        it("should warn if already initialized", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });
            const result = await runCli(["--init", "aws"], { cwd: testDir });
            expect(result.all).toContain("Dorky is already initialized");
        });

        it("should fail checkDorkyProject when running list in uninitialized directory", async () => {
            const result = await runCli(["--list"], { cwd: testDir });
            expect(result.exitCode).toBe(1);
            expect(result.all).toContain("Not a dorky project");
        });

        it("should fail init with invalid storage", async () => {
            const result = await runCli(["--init", "invalid-storage"], { cwd: testDir });
            expect(result.all).toContain("Invalid storage");
        });

        it("should fail init aws with missing environment variables", async () => {
            const result = await runCli(["--init", "aws"], {
                cwd: testDir,
                env: {
                    AWS_ACCESS_KEY: "",
                    AWS_SECRET_KEY: "",
                    AWS_REGION: "",
                    BUCKET_NAME: ""
                }
            });
            expect(result.all).toContain("Missing AWS environment variables");
        });
    })

    describe("Complete Google Drive workdlow", () => {
        it("should complete a full Google Drive workflow: initialize, add files, list, remove, add again, push, delete locally, pull and destroy", async () => {
            // Initialize with Google Drive
            let result = await runCli(["--init", "google-drive"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Create test files
            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=google-drive-test");

            // Add files
            result = await runCli(["--add", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // List files
            result = await runCli(["--list"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain(".env");

            // Remove files
            result = await runCli(["--rm", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Add files again
            result = await runCli(["--add", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Push files to Google Drive
            result = await runCli(["--push"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Delete local .env file
            fs.unlinkSync(envFile);
            expect(fs.existsSync(envFile)).toBe(false);

            // Pull files from Google Drive
            result = await runCli(["--pull"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Verify .env file is restored
            expect(fs.existsSync(envFile)).toBe(true);
            const content = fs.readFileSync(envFile, "utf-8");
            expect(content).toBe("secret=google-drive-test");

            // Destroy
            result = await runCli(["--destroy"], { cwd: testDir });

            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

        it("should remove file from remote when removed via rm and pushed", async () => {
            // Initialize
            await runCli(["--init", "google-drive"], { cwd: testDir });

            // Create file
            const testFile = path.join(testDir, "delete-me.txt");
            fs.writeFileSync(testFile, "delete me");

            // Add and Push
            await runCli(["--add", "delete-me.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Ensure it's there
            let result = await runCli(["--list", "remote"], { cwd: testDir });
            expect(result.all).toContain("delete-me.txt");

            // Remove and Push
            await runCli(["--rm", "delete-me.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Ensure it's gone
            result = await runCli(["--list", "remote"], { cwd: testDir });
            expect(result.all).not.toContain("delete-me.txt");

            result = await runCli(["--destroy"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

    });

    describe("Complete AWS S3 workflow", () => {
        it("should complete a full AWS S3 workflow: initialize, add files, list, remove, add again, push, delete locally, pull and destroy", async () => {

            // Initialize with AWS S3
            let result = await runCli(["--init", "aws"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            // Create test files
            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=aws-s3-test");

            // Add files
            result = await runCli(["--add", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // List files
            result = await runCli(["--list"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain(".env");

            // Remove files
            result = await runCli(["--rm", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Add files again
            result = await runCli(["--add", ".env"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Push files to AWS S3
            result = await runCli(["--push"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Delete local .env file
            fs.unlinkSync(envFile);
            expect(fs.existsSync(envFile)).toBe(false);

            // Pull files from AWS S3
            result = await runCli(["--pull"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            // Verify .env file is restored
            expect(fs.existsSync(envFile)).toBe(true);
            const content = fs.readFileSync(envFile, "utf-8");
            expect(content).toBe("secret=aws-s3-test");

            result = await runCli(["--destroy"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

        it("should remove file from remote when removed via rm and pushed", async () => {
            // Initialize
            await runCli(["--init", "aws"], { cwd: testDir });

            // Create file
            const testFile = path.join(testDir, "delete-me.txt");
            fs.writeFileSync(testFile, "delete me");

            // Add and Push
            await runCli(["--add", "delete-me.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Ensure it's there
            let result = await runCli(["--list", "remote"], { cwd: testDir });
            expect(result.all).toContain("delete-me.txt");

            // Remove and Push
            await runCli(["--rm", "delete-me.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Ensure it's gone
            result = await runCli(["--list", "remote"], { cwd: testDir });
            expect(result.all).not.toContain("delete-me.txt");

            result = await runCli(["--destroy"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

    });
});
