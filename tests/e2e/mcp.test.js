import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMcpClient } from "../helpers/runMcp.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// A 256-byte fixture containing every possible byte value, including
// invalid UTF-8 sequences that a string round-trip would mangle.
const binaryFixture = () => Buffer.from(Array.from({ length: 256 }, (_, i) => i));

describe("Dorky MCP Server - E2E Tests", () => {
    let testDir;
    let mcp;

    beforeEach(async () => {
        testDir = fs.mkdtempSync(path.join(process.cwd(), "dorky-mcp-test-"));
        mcp = await createMcpClient({ cwd: testDir });
    });

    afterEach(async () => {
        if (mcp) await mcp.close();
        if (testDir && fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("Fail safes", () => {
        it("should warn if already initialized", async () => {
            await mcp.callTool("init", { provider: "aws" });
            const result = await mcp.callTool("init", { provider: "aws" });
            expect(result.text).toContain("Dorky is already initialized");
        });

        it("should fail listing in an uninitialized directory", async () => {
            const result = await mcp.callTool("list", {});
            expect(result.isError).toBe(true);
            expect(result.text).toContain("Not a dorky project");
        });

        it("should fail init with invalid storage", async () => {
            const result = await mcp.callTool("init", { provider: "invalid-storage" });
            expect(result.text).toContain("Invalid storage");
        });
    });

    describe("Complete Google Drive workflow", () => {
        it("should complete a full Google Drive workflow: initialize, add files, list, push, delete locally, pull and destroy", async () => {
            let result = await mcp.callTool("init", { provider: "google-drive" });
            expect(result.text).toContain("initialized successfully");

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=google-drive-mcp-test");

            result = await mcp.callTool("add", { files: [".env"] });
            expect(result.text).toContain("Staged: .env");

            result = await mcp.callTool("list", {});
            expect(result.text).toContain(".env");

            result = await mcp.callTool("push", {});
            expect(result.isError).toBeFalsy();

            fs.unlinkSync(envFile);
            expect(fs.existsSync(envFile)).toBe(false);

            result = await mcp.callTool("pull", {});
            expect(result.isError).toBeFalsy();

            expect(fs.existsSync(envFile)).toBe(true);
            expect(fs.readFileSync(envFile, "utf-8")).toBe("secret=google-drive-mcp-test");

            result = await mcp.callTool("destroy", {});
            expect(result.text).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
        });

        it("should round-trip a binary file byte-identically via pull", async () => {
            await mcp.callTool("init", { provider: "google-drive" });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await mcp.callTool("add", { files: ["secret.bin"] });
            await mcp.callTool("push", {});

            fs.unlinkSync(binFile);
            expect(fs.existsSync(binFile)).toBe(false);

            const result = await mcp.callTool("pull", {});
            expect(result.isError).toBeFalsy();

            expect(fs.existsSync(binFile)).toBe(true);
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await mcp.callTool("destroy", {});
        });
    });

    describe("Complete AWS S3 workflow", () => {
        it("should complete a full AWS S3 workflow: initialize, add files, list, push, delete locally, pull and destroy", async () => {
            let result = await mcp.callTool("init", { provider: "aws" });
            expect(result.text).toContain("initialized successfully");

            const envFile = path.join(testDir, ".env");
            fs.writeFileSync(envFile, "secret=aws-s3-mcp-test");

            result = await mcp.callTool("add", { files: [".env"] });
            expect(result.text).toContain("Staged: .env");

            result = await mcp.callTool("list", {});
            expect(result.text).toContain(".env");

            result = await mcp.callTool("push", {});
            expect(result.isError).toBeFalsy();

            fs.unlinkSync(envFile);
            expect(fs.existsSync(envFile)).toBe(false);

            result = await mcp.callTool("pull", {});
            expect(result.isError).toBeFalsy();

            expect(fs.existsSync(envFile)).toBe(true);
            expect(fs.readFileSync(envFile, "utf-8")).toBe("secret=aws-s3-mcp-test");

            result = await mcp.callTool("destroy", {});
            expect(result.text).toContain("Project destroyed locally");
            expect(fs.existsSync(path.join(testDir, ".dorky"))).toBe(false);
        });

        it("should round-trip a binary file byte-identically via pull", async () => {
            await mcp.callTool("init", { provider: "aws" });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await mcp.callTool("add", { files: ["secret.bin"] });
            await mcp.callTool("push", {});

            fs.unlinkSync(binFile);
            expect(fs.existsSync(binFile)).toBe(false);

            const result = await mcp.callTool("pull", {});
            expect(result.isError).toBeFalsy();

            expect(fs.existsSync(binFile)).toBe(true);
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await mcp.callTool("destroy", {});
        });
    });

    describe("History (log and checkout)", () => {
        it("should display push commits via log", async () => {
            await mcp.callTool("init", { provider: "aws" });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "v1");
            await mcp.callTool("add", { files: ["notes.txt"] });
            await mcp.callTool("push", {});

            const result = await mcp.callTool("log", {});
            expect(result.text).toContain("Push History");
            expect(result.text).toContain("notes.txt");

            await mcp.callTool("destroy", {});
        });

        it("should restore files to a previous commit via checkout", async () => {
            await mcp.callTool("init", { provider: "aws" });

            const file = path.join(testDir, "notes.txt");
            fs.writeFileSync(file, "v1-content");
            await mcp.callTool("add", { files: ["notes.txt"] });
            await mcp.callTool("push", {});

            const historyPath = path.join(testDir, ".dorky", "history.json");
            const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
            const firstCommit = history[0].id;

            fs.writeFileSync(file, "v2-content");
            await mcp.callTool("add", { files: ["notes.txt"] });
            await mcp.callTool("push", {});

            const result = await mcp.callTool("checkout", { commitId: firstCommit });
            expect(result.isError).toBeFalsy();
            expect(fs.readFileSync(file, "utf-8")).toBe("v1-content");

            await mcp.callTool("destroy", {});
        });

        it("should restore a binary file byte-identically via checkout", async () => {
            await mcp.callTool("init", { provider: "aws" });

            const binFile = path.join(testDir, "secret.bin");
            const original = binaryFixture();
            fs.writeFileSync(binFile, original);

            await mcp.callTool("add", { files: ["secret.bin"] });
            await mcp.callTool("push", {});

            const historyPath = path.join(testDir, ".dorky", "history.json");
            const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
            const firstCommit = history[0].id;

            // Overwrite locally with different content and push again so the
            // first commit's history copy is what checkout restores from.
            fs.writeFileSync(binFile, "corrupted");
            await mcp.callTool("add", { files: ["secret.bin"] });
            await mcp.callTool("push", {});

            const result = await mcp.callTool("checkout", { commitId: firstCommit });
            expect(result.isError).toBeFalsy();
            expect(fs.readFileSync(binFile).equals(original)).toBe(true);

            await mcp.callTool("destroy", {});
        });
    });
});
