#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { existsSync, mkdirSync, writeFileSync, readFileSync, createReadStream, unlinkSync, rmSync } = require("fs");
const { glob } = require("glob");
const path = require("path");
const mimeTypes = require("mime-types");
const md5 = require("md5");
const EOL = require("os").type() == "Darwin" ? "\r\n" : "\n";
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, S3Client } = require("@aws-sdk/client-s3");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// Constants & Config
const DORKY_DIR = ".dorky";
const METADATA_PATH = path.join(DORKY_DIR, "metadata.json");
const CREDENTIALS_PATH = path.join(DORKY_DIR, "credentials.json");
const HISTORY_PATH = path.join(DORKY_DIR, "history.json");
const GD_CREDENTIALS_PATH = path.join(__dirname, "../google-drive-credentials.json");
const SCOPES = ["https://www.googleapis.com/auth/drive"];

// Helpers
const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p)) : {};
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

const checkDorkyProject = () => {
    if (!existsSync(DORKY_DIR) && !existsSync(".dorkyignore")) {
        throw new Error("Not a dorky project. Please run init first.");
    }
};

function updateGitIgnore() {
    let content = existsSync(".gitignore") ? readFileSync(".gitignore").toString() : "";
    if (!content.includes(CREDENTIALS_PATH)) {
        writeFileSync(".gitignore", content + EOL + CREDENTIALS_PATH + EOL);
    }
}

async function authorizeGoogleDriveClient(forceReauth = false) {
    if (!forceReauth && existsSync(CREDENTIALS_PATH)) {
        const saved = readJson(CREDENTIALS_PATH);
        if (saved.storage === "google-drive" && saved.expiry_date) {
            const keys = readJson(GD_CREDENTIALS_PATH);
            const key = keys.installed || keys.web;
            const client = new google.auth.OAuth2(key.client_id, key.client_secret, key.redirect_uris[0]);
            client.setCredentials(saved);

            if (Date.now() >= saved.expiry_date - 300000) {
                try {
                    const { credentials } = await client.refreshAccessToken();
                    writeJson(CREDENTIALS_PATH, { storage: "google-drive", ...credentials });
                    client.setCredentials(credentials);
                } catch (e) {
                    return authorizeGoogleDriveClient(true);
                }
            }
            return client;
        }
    }

    const client = await authenticate({ scopes: SCOPES, keyfilePath: GD_CREDENTIALS_PATH });
    if (client?.credentials && existsSync(path.dirname(CREDENTIALS_PATH))) {
        writeJson(CREDENTIALS_PATH, { storage: "google-drive", ...client.credentials });
    }
    return client;
}

async function init(storage) {
    if (existsSync(DORKY_DIR)) return "Dorky is already initialized.";
    if (!["aws", "google-drive"].includes(storage)) return "Invalid storage. Use 'aws' or 'google-drive'.";

    let credentials = {};
    if (storage === "aws") {
        if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY || !process.env.AWS_REGION || !process.env.BUCKET_NAME) {
            return "Missing AWS environment variables (AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, BUCKET_NAME).";
        }
        credentials = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME };
    } else {
        const client = await authorizeGoogleDriveClient(true);
        credentials = { storage: "google-drive", ...client.credentials };
    }

    mkdirSync(DORKY_DIR);
    writeJson(METADATA_PATH, { "stage-1-files": {}, "uploaded-files": {} });
    writeJson(HISTORY_PATH, []);
    writeFileSync(".dorkyignore", "");
    writeJson(CREDENTIALS_PATH, credentials);
    updateGitIgnore();
    return "Dorky project initialized successfully.";
}

async function list(type) {
    checkDorkyProject();
    const meta = readJson(METADATA_PATH);
    const lines = [];

    if (type === "remote") {
        if (!await checkCredentials()) return "Credentials not found. Please run init first.";
        const creds = readJson(CREDENTIALS_PATH);
        const root = path.basename(process.cwd());
        lines.push("Remote Files:");

        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root + "/" }));
                if (!data.Contents?.length) { lines.push("No remote files found."); return; }
                data.Contents.forEach(o => lines.push(`  ${o.Key.replace(root + "/", "")}`));
            });
        } else {
            await runDrive(async (drive) => {
                const q = `name='${root}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
                const { data: { files: [folder] } } = await drive.files.list({ q, fields: "files(id)" });
                if (!folder) { lines.push("Remote folder not found."); return; }
                const walk = async (pid, p = "") => {
                    const { data: { files } } = await drive.files.list({ q: `'${pid}' in parents and trashed=false`, fields: "files(id, name, mimeType)" });
                    for (const f of files) {
                        if (f.mimeType === "application/vnd.google-apps.folder") await walk(f.id, path.join(p, f.name));
                        else lines.push(`  ${path.join(p, f.name)}`);
                    }
                };
                await walk(folder.id);
            });
        }
    } else {
        lines.push("Untracked Files:");
        const exclusions = existsSync(".dorkyignore") ? readFileSync(".dorkyignore").toString().split(EOL).filter(Boolean) : [];
        const files = await glob("**/*", { dot: true, ignore: [...exclusions.map(e => `**/${e}/**`), ...exclusions, ".dorky/**", ".dorkyignore", ".git/**", "node_modules/**"] });

        files.forEach(f => {
            const rel = path.relative(process.cwd(), f);
            if (rel.includes(".env") || rel.includes(".config")) lines.push(`  ${rel} (Potential sensitive file)`);
            else lines.push(`  ${rel}`);
        });
        lines.push("\nStaged Files:");
        Object.keys(meta["stage-1-files"]).forEach(f => lines.push(`  ${f}`));
    }

    return lines.join("\n");
}

function add(files) {
    checkDorkyProject();
    const meta = readJson(METADATA_PATH);
    const results = [];
    files.forEach(f => {
        if (!existsSync(f)) { results.push(`File not found: ${f}`); return; }
        const hash = md5(readFileSync(f));
        if (meta["stage-1-files"][f]?.hash === hash) { results.push(`${f} (unchanged)`); return; }
        meta["stage-1-files"][f] = { "mime-type": mimeTypes.lookup(f) || "application/octet-stream", hash };
        results.push(`Staged: ${f}`);
    });
    writeJson(METADATA_PATH, meta);
    return results.join("\n");
}

function rm(files) {
    checkDorkyProject();
    const meta = readJson(METADATA_PATH);
    const removed = files.filter(f => {
        if (!meta["stage-1-files"][f]) return false;
        delete meta["stage-1-files"][f];
        return true;
    });
    writeJson(METADATA_PATH, meta);
    return removed.length
        ? removed.map(f => `Unstaged: ${f}`).join("\n")
        : "No matching files to remove.";
}

async function checkCredentials() {
    if (existsSync(CREDENTIALS_PATH)) return true;
    if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY) {
        writeJson(CREDENTIALS_PATH, {
            storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY,
            awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME
        });
        return true;
    }
    try {
        const client = await authorizeGoogleDriveClient(true);
        if (client) return true;
    } catch { }
    return false;
}

const getS3 = (c) => new S3Client({
    credentials: { accessKeyId: c.accessKey || process.env.AWS_ACCESS_KEY, secretAccessKey: c.secretKey || process.env.AWS_SECRET_KEY },
    region: c.awsRegion || process.env.AWS_REGION
});

async function runS3(creds, fn) {
    try { await fn(getS3(creds), creds.bucket || process.env.BUCKET_NAME); }
    catch (err) {
        if (["InvalidAccessKeyId", "SignatureDoesNotMatch"].includes(err.name) || err.$metadata?.httpStatusCode === 403) {
            if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY) {
                const newCreds = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME };
                writeJson(CREDENTIALS_PATH, newCreds);
                try { await fn(getS3(newCreds), newCreds.bucket); return; } catch { }
            }
            throw new Error("AWS authentication failed.");
        }
        throw err;
    }
}

async function getFolderId(pathStr, drive, create = true) {
    let parentId = "root";
    if (!pathStr || pathStr === ".") return parentId;
    for (const folder of pathStr.split("/")) {
        if (!folder) continue;
        const res = await drive.files.list({ q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`, fields: "files(id)" });
        if (res.data.files[0]) parentId = res.data.files[0].id;
        else if (create) parentId = (await drive.files.create({ requestBody: { name: folder, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id" })).data.id;
        else return null;
    }
    return parentId;
}

async function runDrive(fn) {
    let client = await authorizeGoogleDriveClient();
    let drive = google.drive({ version: "v3", auth: client });
    try { await fn(drive); }
    catch (err) {
        if (err.code === 401 || err.message?.includes("invalid_grant")) {
            if (existsSync(CREDENTIALS_PATH)) unlinkSync(CREDENTIALS_PATH);
            client = await authorizeGoogleDriveClient(true);
            drive = google.drive({ version: "v3", auth: client });
            await fn(drive);
        } else throw err;
    }
}

async function push() {
    checkDorkyProject();
    if (!await checkCredentials()) return "Credentials not found. Please run init first.";
    const meta = readJson(METADATA_PATH);
    const filesToUpload = Object.keys(meta["stage-1-files"])
        .filter(f => !meta["uploaded-files"][f] || meta["stage-1-files"][f].hash !== meta["uploaded-files"][f].hash)
        .map(f => ({ name: f, ...meta["stage-1-files"][f] }));
    const filesToDelete = Object.keys(meta["uploaded-files"]).filter(f => !meta["stage-1-files"][f]);

    if (filesToUpload.length === 0 && filesToDelete.length === 0) return "Nothing to push.";

    const creds = readJson(CREDENTIALS_PATH);
    const results = [];

    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            if (filesToUpload.length > 0) {
                await Promise.all(filesToUpload.map(async f => {
                    const key = path.join(path.basename(process.cwd()), f.name);
                    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(f.name) }));
                    results.push(`Uploaded: ${f.name}`);
                }));
            }
            if (filesToDelete.length > 0) {
                await Promise.all(filesToDelete.map(async f => {
                    const key = path.join(path.basename(process.cwd()), f);
                    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
                    results.push(`Deleted remote: ${f}`);
                }));
            }
        });
    } else if (creds.storage === "google-drive") {
        await runDrive(async (drive) => {
            if (filesToUpload.length > 0) {
                for (const f of filesToUpload) {
                    const root = path.basename(process.cwd());
                    const parentId = await getFolderId(path.dirname(path.join(root, f.name)), drive);
                    await drive.files.create({
                        requestBody: { name: path.basename(f.name), parents: [parentId] },
                        media: { mimeType: f["mime-type"], body: createReadStream(f.name) }
                    });
                    results.push(`Uploaded: ${f.name}`);
                }
            }
            if (filesToDelete.length > 0) {
                const root = path.basename(process.cwd());
                for (const f of filesToDelete) {
                    const parentId = await getFolderId(path.dirname(path.join(root, f)), drive, false);
                    if (parentId) {
                        const res = await drive.files.list({ q: `name='${path.basename(f)}' and '${parentId}' in parents and trashed=false`, fields: "files(id)" });
                        if (res.data.files[0]) {
                            await drive.files.delete({ fileId: res.data.files[0].id });
                            results.push(`Deleted remote: ${f}`);
                        }
                    }
                }
            }
        });
    }

    meta["uploaded-files"] = { ...meta["stage-1-files"] };
    writeJson(METADATA_PATH, meta);

    const commitFiles = { ...meta["stage-1-files"] };
    const commitId = md5(JSON.stringify(commitFiles)).slice(0, 8);
    const history = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH)) : [];
    if (!history.find(e => e.id === commitId)) {
        history.push({ id: commitId, timestamp: new Date().toISOString(), files: commitFiles });
        writeJson(HISTORY_PATH, history);

        const root = path.basename(process.cwd());
        const historyPrefix = path.join(root, ".dorky-history", commitId);
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(commitFiles).map(async f => {
                    const key = path.join(historyPrefix, f);
                    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(f) }));
                }));
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                for (const f of Object.keys(commitFiles)) {
                    const parentId = await getFolderId(path.join(root, ".dorky-history", commitId, path.dirname(f)), drive);
                    await drive.files.create({
                        requestBody: { name: path.basename(f), parents: [parentId] },
                        media: { mimeType: commitFiles[f]["mime-type"], body: createReadStream(f) }
                    });
                }
            });
        }
        results.push(`History commit saved: ${commitId}`);
    }

    return results.join("\n");
}

async function pull() {
    checkDorkyProject();
    if (!await checkCredentials()) return "Credentials not found. Please run init first.";
    const meta = readJson(METADATA_PATH);
    const files = meta["uploaded-files"];
    const creds = readJson(CREDENTIALS_PATH);
    const results = [];

    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            await Promise.all(Object.keys(files).map(async f => {
                const key = path.join(path.basename(process.cwd()), f);
                const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                const dir = path.dirname(f);
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                writeFileSync(f, await Body.transformToString());
                results.push(`Downloaded: ${f}`);
            }));
        });
    } else if (creds.storage === "google-drive") {
        await runDrive(async (drive) => {
            const fileList = Object.keys(files).map(k => ({ name: k, ...files[k] }));
            await Promise.all(fileList.map(async f => {
                const res = await drive.files.list({ q: `name='${path.basename(f.name)}' and mimeType!='application/vnd.google-apps.folder'`, fields: "files(id)" });
                if (!res.data.files[0]) { results.push(`Missing remote file: ${f.name}`); return; }
                const data = await drive.files.get({ fileId: res.data.files[0].id, alt: "media" });
                if (!existsSync(path.dirname(f.name))) mkdirSync(path.dirname(f.name), { recursive: true });
                writeFileSync(f.name, await data.data.text());
                results.push(`Downloaded: ${f.name}`);
            }));
        });
    }

    return results.join("\n") || "Nothing to pull.";
}

function log() {
    checkDorkyProject();
    const history = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH)) : [];
    if (!history.length) return "No history found. Push some files first.";

    const lines = ["Push History:"];
    [...history].reverse().forEach((entry, i) => {
        const date = new Date(entry.timestamp).toLocaleString();
        const fileCount = Object.keys(entry.files).length;
        lines.push(`  commit ${entry.id}${i === 0 ? " (latest)" : ""}`);
        lines.push(`  Date:  ${date}`);
        lines.push(`  Files: ${fileCount}`);
        Object.keys(entry.files).forEach(f => lines.push(`    • ${f}`));
        lines.push("");
    });
    return lines.join("\n");
}

async function checkout(commitId) {
    checkDorkyProject();
    if (!await checkCredentials()) return "Credentials not found. Please run init first.";

    const history = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH)) : [];
    const entry = history.find(e => e.id === commitId || e.id.startsWith(commitId));
    if (!entry) return `Commit not found: ${commitId}. Run log to see available commits.`;

    const creds = readJson(CREDENTIALS_PATH);
    const root = path.basename(process.cwd());
    const historyPrefix = path.join(root, ".dorky-history", entry.id);
    const results = [`Checking out commit ${entry.id} (${new Date(entry.timestamp).toLocaleString()}):`];

    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            await Promise.all(Object.keys(entry.files).map(async f => {
                const key = path.join(historyPrefix, f);
                const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                if (!existsSync(path.dirname(f))) mkdirSync(path.dirname(f), { recursive: true });
                writeFileSync(f, await Body.transformToString());
                results.push(`Restored: ${f}`);
            }));
        });
    } else if (creds.storage === "google-drive") {
        await runDrive(async (drive) => {
            for (const f of Object.keys(entry.files)) {
                const parentId = await getFolderId(path.join(root, ".dorky-history", entry.id, path.dirname(f)), drive, false);
                if (!parentId) { results.push(`Remote history folder missing for: ${f}`); continue; }
                const res = await drive.files.list({ q: `name='${path.basename(f)}' and '${parentId}' in parents and trashed=false`, fields: "files(id)" });
                if (!res.data.files[0]) { results.push(`Missing remote history file: ${f}`); continue; }
                const data = await drive.files.get({ fileId: res.data.files[0].id, alt: "media" });
                if (!existsSync(path.dirname(f))) mkdirSync(path.dirname(f), { recursive: true });
                writeFileSync(f, await data.data.text());
                results.push(`Restored: ${f}`);
            }
        });
    }

    const meta = readJson(METADATA_PATH);
    meta["stage-1-files"] = { ...entry.files };
    meta["uploaded-files"] = { ...entry.files };
    writeJson(METADATA_PATH, meta);
    results.push(`Staged and uploaded state restored to commit ${entry.id}.`);
    return results.join("\n");
}

async function destroy() {
    checkDorkyProject();
    if (!await checkCredentials()) return "Credentials not found. Please run init first.";

    const creds = readJson(CREDENTIALS_PATH);
    const root = path.basename(process.cwd());
    const results = [];

    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root + "/" }));
            if (data.Contents && data.Contents.length > 0) {
                const deleteParams = { Bucket: bucket, Delete: { Objects: data.Contents.map(o => ({ Key: o.Key })) } };
                await s3.send(new DeleteObjectsCommand(deleteParams));
                results.push("Remote files deleted.");
            }
        });
    } else if (creds.storage === "google-drive") {
        await runDrive(async (drive) => {
            const q = `name='${root}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
            const { data: { files: [folder] } } = await drive.files.list({ q, fields: "files(id)" });
            if (folder) {
                await drive.files.delete({ fileId: folder.id });
                results.push("Remote folder deleted.");
            }
        });
    }

    if (existsSync(DORKY_DIR)) rmSync(DORKY_DIR, { recursive: true, force: true });
    if (existsSync(".dorkyignore")) unlinkSync(".dorkyignore");
    results.push("Project destroyed locally.");
    return results.join("\n");
}

// MCP Server setup
const server = new Server(
    { name: "dorky", version: require("../package.json").version },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "init",
            description: "Initialize a dorky project with AWS S3 or Google Drive storage.",
            inputSchema: {
                type: "object",
                properties: {
                    provider: {
                        type: "string",
                        enum: ["aws", "google-drive"],
                        description: "Storage provider to use: 'aws' for AWS S3, 'google-drive' for Google Drive."
                    }
                },
                required: ["provider"]
            }
        },
        {
            name: "list",
            description: "List files tracked by dorky. Without arguments lists local untracked and staged files. Pass 'remote' to list files in remote storage.",
            inputSchema: {
                type: "object",
                properties: {
                    remote: {
                        type: "boolean",
                        description: "Set to true to list remote files in storage instead of local files."
                    }
                }
            }
        },
        {
            name: "add",
            description: "Stage one or more files to be pushed to remote storage.",
            inputSchema: {
                type: "object",
                properties: {
                    files: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of file paths to stage."
                    }
                },
                required: ["files"]
            }
        },
        {
            name: "remove",
            description: "Unstage one or more files from dorky tracking.",
            inputSchema: {
                type: "object",
                properties: {
                    files: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of file paths to unstage."
                    }
                },
                required: ["files"]
            }
        },
        {
            name: "push",
            description: "Push all staged files to remote storage (AWS S3 or Google Drive).",
            inputSchema: {
                type: "object",
                properties: {}
            }
        },
        {
            name: "pull",
            description: "Pull all tracked files from remote storage to the local project.",
            inputSchema: {
                type: "object",
                properties: {}
            }
        },
        {
            name: "log",
            description: "Show the push history with commit IDs, timestamps, and file lists.",
            inputSchema: {
                type: "object",
                properties: {}
            }
        },
        {
            name: "checkout",
            description: "Restore files from a specific history commit. Use 'log' first to find commit IDs.",
            inputSchema: {
                type: "object",
                properties: {
                    commitId: {
                        type: "string",
                        description: "The commit ID (or prefix) to restore. Find commit IDs with the 'log' tool."
                    }
                },
                required: ["commitId"]
            }
        },
        {
            name: "destroy",
            description: "Destroy the dorky project locally and remove all files from remote storage. This action is irreversible.",
            inputSchema: {
                type: "object",
                properties: {}
            }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
        let result;
        switch (name) {
            case "init":
                result = await init(args.provider);
                break;
            case "list":
                result = await list(args.remote ? "remote" : undefined);
                break;
            case "add":
                result = add(args.files);
                break;
            case "remove":
                result = rm(args.files);
                break;
            case "push":
                result = await push();
                break;
            case "pull":
                result = await pull();
                break;
            case "log":
                result = log();
                break;
            case "checkout":
                result = await checkout(args.commitId);
                break;
            case "destroy":
                result = await destroy();
                break;
            default:
                return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
        }

        return { content: [{ type: "text", text: result || "Done." }] };
    } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(err => {
    process.stderr.write(`Fatal error: ${err.message}\n`);
    process.exit(1);
});
