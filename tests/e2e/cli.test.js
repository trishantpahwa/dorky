import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "../helpers/runCli.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// A 256-byte fixture containing every possible byte value, including
// invalid UTF-8 sequences that a string round-trip would mangle.
const binaryFixture = () => Buffer.from(Array.from({ length: 256 }, (_, i) => i));

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

            // Ensure it's gone from the primary location (history copy at
            // .dorky-history/<commitId>/delete-me.txt is expected to remain).
            result = await runCli(["--list", "remote"], { cwd: testDir });
            const nonHistoryListing = result.all
                .split("\n")
                .filter(l => !l.includes(".dorky-history/"))
                .join("\n");
            expect(nonHistoryListing).not.toContain("delete-me.txt");

            result = await runCli(["--destroy"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

        it("should round-trip a binary file byte-identically via --pull", async () => {
            await runCli(["--init", "google-drive"], { cwd: testDir });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await runCli(["--add", "secret.bin"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            fs.unlinkSync(binFile);
            expect(fs.existsSync(binFile)).toBe(false);

            const result = await runCli(["--pull"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            expect(fs.existsSync(binFile)).toBe(true);
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
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

            // Ensure it's gone from the primary location (history copy at
            // .dorky-history/<commitId>/delete-me.txt is expected to remain).
            result = await runCli(["--list", "remote"], { cwd: testDir });
            const nonHistoryListing = result.all
                .split("\n")
                .filter(l => !l.includes(".dorky-history/"))
                .join("\n");
            expect(nonHistoryListing).not.toContain("delete-me.txt");

            result = await runCli(["--destroy"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
            expect(fs.existsSync(path.join(testDir, ".dorkyignore"))).toBe(false);
        });

        it("should round-trip a binary file byte-identically via --pull", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await runCli(["--add", "secret.bin"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            fs.unlinkSync(binFile);
            expect(fs.existsSync(binFile)).toBe(false);

            const result = await runCli(["--pull"], { cwd: testDir });
            expect(result.exitCode).toBe(0);

            expect(fs.existsSync(binFile)).toBe(true);
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
        });

    });

    describe("Re-initialization (clone scenario)", () => {
        it("should treat missing credentials.json as uninitialized even when .dorky/ exists", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            // Simulate clone: only credentials.json is missing (it's gitignored)
            fs.unlinkSync(path.join(testDir, ".dorky", "credentials.json"));

            const result = await runCli(["--init", "aws"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("initialized successfully");
            expect(fs.existsSync(path.join(testDir, ".dorky", "credentials.json"))).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should preserve metadata.json, history.json, and .dorkyignore on AWS re-init", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=preserve-aws");
            await runCli(["--add", ".env"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const dorkyIgnore = path.join(testDir, ".dorkyignore");
            fs.writeFileSync(dorkyIgnore, "*.tmp\nlogs/\n");

            const metaPath = path.join(testDir, ".dorky", "metadata.json");
            const historyPath = path.join(testDir, ".dorky", "history.json");
            const credPath = path.join(testDir, ".dorky", "credentials.json");

            const originalMeta = fs.readFileSync(metaPath, "utf-8");
            const originalHistory = fs.readFileSync(historyPath, "utf-8");
            const originalIgnore = fs.readFileSync(dorkyIgnore, "utf-8");

            // Simulate clone: drop only credentials.json
            fs.unlinkSync(credPath);

            const result = await runCli(["--init", "aws"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("initialized successfully");

            expect(fs.readFileSync(metaPath, "utf-8")).toBe(originalMeta);
            expect(fs.readFileSync(historyPath, "utf-8")).toBe(originalHistory);
            expect(fs.readFileSync(dorkyIgnore, "utf-8")).toBe(originalIgnore);
            expect(fs.existsSync(credPath)).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should preserve metadata.json, history.json, and .dorkyignore on Google Drive re-init", async () => {
            await runCli(["--init", "google-drive"], { cwd: testDir });

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=preserve-gd");
            await runCli(["--add", ".env"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const dorkyIgnore = path.join(testDir, ".dorkyignore");
            fs.writeFileSync(dorkyIgnore, "*.tmp\n");

            const metaPath = path.join(testDir, ".dorky", "metadata.json");
            const historyPath = path.join(testDir, ".dorky", "history.json");
            const credPath = path.join(testDir, ".dorky", "credentials.json");

            const originalMeta = fs.readFileSync(metaPath, "utf-8");
            const originalHistory = fs.readFileSync(historyPath, "utf-8");
            const originalIgnore = fs.readFileSync(dorkyIgnore, "utf-8");

            fs.unlinkSync(credPath);

            const result = await runCli(["--init", "google-drive"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("initialized successfully");

            expect(fs.readFileSync(metaPath, "utf-8")).toBe(originalMeta);
            expect(fs.readFileSync(historyPath, "utf-8")).toBe(originalHistory);
            expect(fs.readFileSync(dorkyIgnore, "utf-8")).toBe(originalIgnore);
            expect(fs.existsSync(credPath)).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should allow pulling files after re-init in a fresh clone", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=clone-pull-test");
            await runCli(["--add", ".env"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Simulate clone: keep .dorky/metadata.json, .dorky/history.json, .dorkyignore;
            // remove credentials.json and local working files.
            fs.unlinkSync(path.join(testDir, ".dorky", "credentials.json"));
            fs.unlinkSync(envFile);

            const initResult = await runCli(["--init", "aws"], { cwd: testDir });
            expect(initResult.exitCode).toBe(0);

            const pullResult = await runCli(["--pull"], { cwd: testDir });
            expect(pullResult.exitCode).toBe(0);
            expect(fs.existsSync(envFile)).toBe(true);
            expect(fs.readFileSync(envFile, "utf-8")).toBe("secret=clone-pull-test");

            await runCli(["--destroy"], { cwd: testDir });
        });
    });

    describe("Push behavior", () => {
        it("should report 'Nothing to push' when staged state matches uploaded state", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=no-changes");
            await runCli(["--add", ".env"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const result = await runCli(["--push"], { cwd: testDir });
            expect(result.all).toContain("Nothing to push");

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should report 'Already on the latest commit' when re-pushing the same committed state", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=latest-commit");
            await runCli(["--add", ".env"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Force filesToUpload to be non-empty while keeping the staged state
            // identical to the most recent commit (the clone-then-restage scenario).
            const metaPath = path.join(testDir, ".dorky", "metadata.json");
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            meta["uploaded-files"] = {};
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

            const result = await runCli(["--push"], { cwd: testDir });
            expect(result.all).toContain("Already on the latest commit");

            // Restore uploaded-files so destroy works cleanly
            meta["uploaded-files"] = { ...meta["stage-1-files"] };
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            await runCli(["--destroy"], { cwd: testDir });
        });
    });

    describe("History (log and checkout)", () => {
        it("should report 'No history found' when --log is run before any push", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });
            const result = await runCli(["--log"], { cwd: testDir });
            expect(result.all).toContain("No history found");
            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should display all push commits via --log with the latest marker", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "v1");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            fs.writeFileSync(file, "v2");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const result = await runCli(["--log"], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Push History");
            expect(result.all).toContain("(latest)");
            expect(result.all).toContain("notes.txt");

            const commitMatches = result.all.match(/commit [a-f0-9]{8}/g) || [];
            expect(commitMatches.length).toBe(2);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should restore files and stage-1-files to a previous commit via --checkout", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "v1-content");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const historyPath = path.join(testDir, ".dorky", "history.json");
            const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
            const firstCommit = history[0].id;

            fs.writeFileSync(file, "v2-content");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            // Sanity check: working copy holds v2
            expect(fs.readFileSync(file, "utf-8")).toBe("v2-content");

            const result = await runCli(["--checkout", firstCommit], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(result.all).toContain("Restored");
            expect(result.all).toContain("notes.txt");
            expect(result.all).toContain("Run --push to publish this state");

            expect(fs.readFileSync(file, "utf-8")).toBe("v1-content");

            const meta = JSON.parse(fs.readFileSync(path.join(testDir, ".dorky", "metadata.json"), "utf-8"));
            expect(Object.keys(meta["stage-1-files"])).toEqual(["notes.txt"]);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should accept a commit-id prefix for --checkout", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "prefix-v1");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const history = JSON.parse(fs.readFileSync(path.join(testDir, ".dorky", "history.json"), "utf-8"));
            const prefix = history[0].id.slice(0, 4);

            fs.writeFileSync(file, "prefix-v2");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const result = await runCli(["--checkout", prefix], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(fs.readFileSync(file, "utf-8")).toBe("prefix-v1");

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should abort --checkout with an ambiguous commit-id prefix", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "stub");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const historyPath = path.join(testDir, ".dorky", "history.json");
            const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
            const entry = history[0];
            history.push({ ...entry, id: entry.id.slice(0, 4) + "z9y8" });
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

            const result = await runCli(["--checkout", entry.id.slice(0, 4)], { cwd: testDir });
            expect(result.all).toContain("Ambiguous commit id");
            expect(result.all).toContain(entry.id);

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should fail --checkout when the commit id does not exist", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "stub");
            await runCli(["--add", "notes.txt"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const result = await runCli(["--checkout", "deadbeef"], { cwd: testDir });
            expect(result.all).toContain("Commit not found");

            await runCli(["--destroy"], { cwd: testDir });
        });

        it("should restore a binary file byte-identically via --checkout", async () => {
            await runCli(["--init", "aws"], { cwd: testDir });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await runCli(["--add", "secret.bin"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const historyPath = path.join(testDir, ".dorky", "history.json");
            const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
            const firstCommit = history[0].id;

            // Overwrite locally with different content and push again so the
            // first commit's history copy is what --checkout restores from.
            fs.writeFileSync(binFile, "corrupted");
            await runCli(["--add", "secret.bin"], { cwd: testDir });
            await runCli(["--push"], { cwd: testDir });

            const result = await runCli(["--checkout", firstCommit], { cwd: testDir });
            expect(result.exitCode).toBe(0);
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await runCli(["--destroy"], { cwd: testDir });
        });
    });
});
