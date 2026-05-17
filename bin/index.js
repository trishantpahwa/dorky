#!/usr/bin/env node

const yargs = require("yargs");
const { existsSync, mkdirSync, writeFileSync, readFileSync, createReadStream, unlinkSync, rmSync } = require("fs");
const chalk = require("chalk");
const { glob } = require("glob");
const path = require("path");
const mimeTypes = require("mime-types");
const md5 = require('md5');
const EOL = require("os").type() == "Darwin" ? "\r\n" : "\n";
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, S3Client } = require("@aws-sdk/client-s3");
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const ora = require("ora");
const boxen = require("boxen");
const prompts = require("prompts");
const Table = require("cli-table3");
const gradient = require("gradient-string");

// Constants & Config
const DORKY_DIR = ".dorky";
const METADATA_PATH = path.join(DORKY_DIR, "metadata.json");
const CREDENTIALS_PATH = path.join(DORKY_DIR, "credentials.json");
const HISTORY_PATH = path.join(DORKY_DIR, "history.json");
const GD_CREDENTIALS_PATH = path.join(__dirname, "../google-drive-credentials.json");
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY) && process.env.NO_COLOR !== "1";

// Helpers
const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p)) : {};
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));
const toPosix = (p) => p ? p.replace(/\\/g, '/') : p;
const normalizeKeys = (obj) => {
    if (!obj) return {};
    const out = {};
    for (const k of Object.keys(obj)) out[toPosix(k)] = obj[k];
    return out;
};
const readMetadata = () => {
    const meta = readJson(METADATA_PATH);
    meta["stage-1-files"] = normalizeKeys(meta["stage-1-files"]);
    meta["uploaded-files"] = normalizeKeys(meta["uploaded-files"]);
    return meta;
};
const readHistory = () => {
    const history = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH)) : [];
    return history.map(e => ({ ...e, files: normalizeKeys(e.files) }));
};

// UX helpers
const makeSpinner = (text) => {
    if (!isTTY) {
        return {
            start() { return this; },
            succeed(t) { if (t) console.log(chalk.green(`✔ ${t}`)); return this; },
            fail(t) { if (t) console.log(chalk.red(`✖ ${t}`)); return this; },
            warn(t) { if (t) console.log(chalk.yellow(`⚠ ${t}`)); return this; },
            info(t) { if (t) console.log(chalk.cyan(`ℹ ${t}`)); return this; },
            stop() { return this; },
            set text(v) { },
        };
    }
    return ora({ text, spinner: "dots", color: "cyan" });
};

const divider = () => isTTY ? chalk.gray("─".repeat(Math.min(60, (process.stdout.columns || 60) - 2))) : "";

const checkDorkyProject = () => {
    if (!existsSync(DORKY_DIR) && !existsSync(".dorkyignore")) {
        console.log(chalk.red("✖ Not a dorky project. Please run ") + chalk.cyan("dorky --init [aws|google-drive]"));
        process.exit(1);
    }
};

const figlet = `
      __            __          \t
  .--|  |-----.----|  |--.--.--.\t
  |  _  |  _  |   _|    <|  |  |\t
  |_____|_____|__| |__|__|___  |\t
                         |_____|\t
`;

function renderBanner() {
    if (!isTTY) {
        console.log(figlet);
        return;
    }
    const colored = gradient(["#00f5d4", "#00bbf9", "#9b5de5"]).multiline(figlet);
    const tagline = chalk.gray("DevOps Records Keeper") + chalk.gray(" · ") + chalk.cyan("dorky --help");
    console.log(boxen(`${colored}\n  ${tagline}`, {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: "round",
        borderColor: "cyan",
    }));
}
renderBanner();

const args = yargs
    .option("init", { alias: "i", describe: "Initialize dorky", type: "string" })
    .option("list", { alias: "l", describe: "List files", type: "string" })
    .option("add", { alias: "a", describe: "Add files", type: "array" })
    .option("rm", { alias: "r", describe: "Remove files", type: "array" })
    .option("push", { alias: "ph", describe: "Push files", type: "string" })
    .option("pull", { alias: "pl", describe: "Pull files", type: "string" })
    .option("migrate", { alias: "m", describe: "Migrate project", type: "string" })
    .option("destroy", { alias: "d", describe: "Destroy project", type: "boolean" })
    .option("log", { alias: "lg", describe: "Show push history", type: "boolean" })
    .option("checkout", { alias: "co", describe: "Restore files from a history commit", type: "string" })
    .option("interactive", { describe: "Open the interactive menu", type: "boolean" })
    .help('help').strict().argv;

const noArgs = Object.keys(args).length === 2 && args._.length === 0;

function updateGitIgnore() {
    let content = existsSync(".gitignore") ? readFileSync(".gitignore").toString() : "";
    if (!content.includes(CREDENTIALS_PATH)) {
        writeFileSync(".gitignore", content + EOL + CREDENTIALS_PATH + EOL);
        console.log(chalk.cyan("ℹ Updated .gitignore to secure credentials."));
    }
}

async function authorizeGoogleDriveClient(forceReauth = false) {
    if (!forceReauth && existsSync(CREDENTIALS_PATH)) {
        const saved = readJson(CREDENTIALS_PATH);
        if (saved.storage === 'google-drive' && saved.expiry_date) {
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
                    console.log(chalk.yellow("Token refresh failed. Re-authenticating..."));
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
    if (existsSync(CREDENTIALS_PATH)) return console.log(chalk.yellow("⚠ Dorky is already initialized."));
    if (!["aws", "google-drive"].includes(storage)) return console.log(chalk.red("✖ Invalid storage. Use 'aws' or 'google-drive'."));

    let credentials = {};
    if (storage === "aws") {
        if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY || !process.env.AWS_REGION || !process.env.BUCKET_NAME) {
            console.log(chalk.red("✖ Missing AWS environment variables."));
            return;
        }
        credentials = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME };
    } else {
        if (!existsSync(DORKY_DIR)) mkdirSync(DORKY_DIR);
        const spinner = makeSpinner("Waiting for Google Drive authorization...").start();
        try {
            const client = await authorizeGoogleDriveClient(true);
            credentials = { storage: "google-drive", ...client.credentials };
            spinner.succeed("Google Drive authorized");
        } catch (err) {
            spinner.fail("Google Drive authorization failed");
            throw err;
        }
    }

    if (!existsSync(DORKY_DIR)) mkdirSync(DORKY_DIR);
    if (!existsSync(METADATA_PATH)) writeJson(METADATA_PATH, { "stage-1-files": {}, "uploaded-files": {} });
    if (!existsSync(HISTORY_PATH)) writeJson(HISTORY_PATH, []);
    if (!existsSync(".dorkyignore")) writeFileSync(".dorkyignore", "");
    writeJson(CREDENTIALS_PATH, credentials);
    console.log(chalk.green("✔ Dorky project initialized successfully.") + chalk.gray(`  [${storage}]`));
    updateGitIgnore();
}

async function list(type) {
    checkDorkyProject();
    const meta = readMetadata();
    if (type === "remote") {
        if (!await checkCredentials()) return;
        const creds = readJson(CREDENTIALS_PATH);
        const root = path.basename(process.cwd());
        const spinner = makeSpinner("Fetching remote file listing...").start();
        const remoteFiles = [];

        try {
            if (creds.storage === "aws") {
                await runS3(creds, async (s3, bucket) => {
                    const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root + "/" }));
                    (data.Contents || []).forEach(o => remoteFiles.push(o.Key.replace(root + "/", "")));
                });
            } else {
                await runDrive(async (drive) => {
                    const q = `name='${root}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
                    const { data: { files: [folder] } } = await drive.files.list({ q, fields: 'files(id)' });
                    if (!folder) return;
                    const walk = async (pid, p = '') => {
                        const { data: { files } } = await drive.files.list({ q: `'${pid}' in parents and trashed=false`, fields: 'files(id, name, mimeType)' });
                        for (const f of files) {
                            if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id, path.join(p, f.name));
                            else remoteFiles.push(path.join(p, f.name));
                        }
                    };
                    await walk(folder.id);
                });
            }
            spinner.stop();
        } catch (err) {
            spinner.fail("Failed to fetch remote files");
            throw err;
        }

        console.log(chalk.blue.bold("\n☁  Remote Files:"));
        if (!remoteFiles.length) return console.log(chalk.yellow("ℹ No remote files found."));
        remoteFiles.forEach(f => console.log(chalk.cyan(`   ${f}`)));
    } else {
        console.log(chalk.blue.bold("\n📂 Untracked Files:"));
        const exclusions = existsSync(".dorkyignore") ? readFileSync(".dorkyignore").toString().split(EOL).filter(Boolean) : [];
        const files = await glob("**/*", { dot: true, ignore: [...exclusions.map(e => `**/${e}/**`), ...exclusions, ".dorky/**", ".dorkyignore", ".git/**", "node_modules/**"] });

        files.forEach(f => {
            const rel = toPosix(path.relative(process.cwd(), f));
            if (rel.includes('.env') || rel.includes('.config')) console.log(chalk.yellow(`   ⚠ ${rel} (Potential sensitive file)`));
            else console.log(chalk.gray(`   ${rel}`));
        });
        console.log(chalk.blue.bold("\n📦 Staged Files:"));
        const staged = Object.keys(meta["stage-1-files"]);
        if (!staged.length) console.log(chalk.gray("   (nothing staged)"));
        else staged.forEach(f => console.log(chalk.green(`   ✔ ${f}`)));
    }
}

function add(files) {
    checkDorkyProject();
    const meta = readMetadata();
    const added = [];
    files.forEach(f => {
        if (!existsSync(f)) return console.log(chalk.red(`✖ File not found: ${f}`));
        const hash = md5(readFileSync(f));
        const key = toPosix(f);
        if (meta["stage-1-files"][key]?.hash === hash) return console.log(chalk.gray(`• ${key} (unchanged)`));
        meta["stage-1-files"][key] = { "mime-type": mimeTypes.lookup(f) || "application/octet-stream", hash };
        added.push(key);
    });
    writeJson(METADATA_PATH, meta);
    added.forEach(f => console.log(chalk.green(`✔ Staged: ${f}`)));
}

function rm(files) {
    checkDorkyProject();
    const meta = readMetadata();
    const removed = files.filter(f => {
        const key = toPosix(f);
        if (!meta["stage-1-files"][key]) return false;
        delete meta["stage-1-files"][key];
        return true;
    });
    writeJson(METADATA_PATH, meta);
    removed.length ? removed.forEach(f => console.log(chalk.yellow(`✔ Unstaged: ${f}`))) : console.log(chalk.gray("ℹ No matching files to remove."));
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
    console.log(chalk.red("✖ Credentials not found. Please run --init."));
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
                console.log(chalk.yellow("AWS auth failed. Retrying with env vars..."));
                const newCreds = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME };
                writeJson(CREDENTIALS_PATH, newCreds);
                try {
                    await fn(getS3(newCreds), newCreds.bucket);
                    return;
                } catch (e) {
                    console.log(chalk.red("Retried with env vars but failed."));
                }
            }
            console.log(chalk.red("AWS authentication failed."));
            console.log(chalk.yellow("Please set correct AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION and BUCKET_NAME in environment or .dorky/credentials.json"));
            process.exit(1);
        }
        throw err;
    }
}

async function getFolderId(pathStr, drive, create = true) {
    let parentId = 'root';
    if (!pathStr || pathStr === '.') return parentId;
    for (const folder of pathStr.split("/")) {
        if (!folder) continue;
        const res = await drive.files.list({ q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`, fields: 'files(id)' });
        if (res.data.files[0]) parentId = res.data.files[0].id;
        else if (create) parentId = (await drive.files.create({ requestBody: { name: folder, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' })).data.id;
        else return null;
    }
    return parentId;
}

async function runDrive(fn) {
    let client = await authorizeGoogleDriveClient();
    let drive = google.drive({ version: 'v3', auth: client });
    try { await fn(drive); }
    catch (err) {
        if (err.code === 401 || err.message?.includes('invalid_grant')) {
            console.log(chalk.yellow("Drive auth failed. Re-authenticating..."));
            if (existsSync(CREDENTIALS_PATH)) unlinkSync(CREDENTIALS_PATH);
            client = await authorizeGoogleDriveClient(true);
            drive = google.drive({ version: 'v3', auth: client });
            await fn(drive);
        } else throw err;
    }
}

async function push() {
    checkDorkyProject();
    if (!await checkCredentials()) return;
    const meta = readMetadata();
    const filesToUpload = Object.keys(meta["stage-1-files"])
        .filter(f => !meta["uploaded-files"][f] || meta["stage-1-files"][f].hash !== meta["uploaded-files"][f].hash)
        .map(f => ({ name: f, ...meta["stage-1-files"][f] }));

    const filesToDelete = Object.keys(meta["uploaded-files"])
        .filter(f => !meta["stage-1-files"][f]);

    if (filesToUpload.length === 0 && filesToDelete.length === 0) return console.log(chalk.yellow("ℹ Nothing to push."));

    const commitFiles = { ...meta["stage-1-files"] };
    const commitId = md5(JSON.stringify(commitFiles)).slice(0, 8);
    const history = readHistory();
    if (history.length > 0 && history[history.length - 1].id === commitId) return console.log(chalk.yellow("ℹ Already on the latest commit. Nothing to push."));

    console.log(chalk.blue.bold(`\n🚀 Pushing ${chalk.cyan(filesToUpload.length)} upload(s), ${chalk.cyan(filesToDelete.length)} deletion(s)`));

    const creds = readJson(CREDENTIALS_PATH);
    const total = filesToUpload.length + filesToDelete.length;
    let done = 0;
    const spinner = makeSpinner(`Syncing files... 0/${total}`).start();
    const tick = (label) => {
        done += 1;
        spinner.text = `${label}  ${done}/${total}`;
    };

    try {
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                if (filesToUpload.length > 0) {
                    await Promise.all(filesToUpload.map(async f => {
                        const key = path.posix.join(path.basename(process.cwd()), f.name);
                        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(f.name) }));
                        tick(`Uploaded ${f.name}`);
                    }));
                }
                if (filesToDelete.length > 0) {
                    await Promise.all(filesToDelete.map(async f => {
                        const key = path.posix.join(path.basename(process.cwd()), f);
                        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
                        tick(`Deleted remote ${f}`);
                    }));
                }
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                if (filesToUpload.length > 0) {
                    for (const f of filesToUpload) {
                        const root = path.basename(process.cwd());
                        const parentId = await getFolderId(path.posix.dirname(path.posix.join(root, f.name)), drive);
                        await drive.files.create({
                            requestBody: { name: path.posix.basename(f.name), parents: [parentId] },
                            media: { mimeType: f["mime-type"], body: createReadStream(f.name) }
                        });
                        tick(`Uploaded ${f.name}`);
                    }
                }
                if (filesToDelete.length > 0) {
                    const root = path.basename(process.cwd());
                    for (const f of filesToDelete) {
                        const parentId = await getFolderId(path.posix.dirname(path.posix.join(root, f)), drive, false);
                        if (parentId) {
                            const res = await drive.files.list({
                                q: `name='${path.posix.basename(f)}' and '${parentId}' in parents and trashed=false`,
                                fields: 'files(id)'
                            });
                            if (res.data.files[0]) {
                                await drive.files.delete({ fileId: res.data.files[0].id });
                                tick(`Deleted remote ${f}`);
                            }
                        }
                    }
                }
            });
        }
        spinner.succeed(`Synced ${done}/${total}`);
    } catch (err) {
        spinner.fail("Push failed");
        throw err;
    }

    filesToUpload.forEach(f => console.log(chalk.green(`✔ Uploaded: ${f.name}`)));
    filesToDelete.forEach(f => console.log(chalk.yellow(`✔ Deleted remote: ${f}`)));

    meta["uploaded-files"] = { ...meta["stage-1-files"] };
    writeJson(METADATA_PATH, meta);

    history.push({ id: commitId, timestamp: new Date().toISOString(), files: commitFiles });
    writeJson(HISTORY_PATH, history);

    const root = path.basename(process.cwd());
    const historyPrefix = path.posix.join(root, ".dorky-history", commitId);
    const historySpinner = makeSpinner(`Archiving commit ${commitId}...`).start();
    try {
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(commitFiles).map(async f => {
                    const key = path.posix.join(historyPrefix, f);
                    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(f) }));
                }));
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                for (const f of Object.keys(commitFiles)) {
                    const parentId = await getFolderId(path.posix.join(root, ".dorky-history", commitId, path.posix.dirname(f)), drive);
                    await drive.files.create({
                        requestBody: { name: path.posix.basename(f), parents: [parentId] },
                        media: { mimeType: commitFiles[f]["mime-type"], body: createReadStream(f) }
                    });
                }
            });
        }
        historySpinner.succeed(`Archived commit ${commitId}`);
    } catch (err) {
        historySpinner.fail(`Failed to archive commit ${commitId}`);
        throw err;
    }
    console.log(chalk.cyan(`ℹ History commit saved: ${commitId}`));
}

async function pull() {
    checkDorkyProject();
    if (!await checkCredentials()) return;
    const meta = readMetadata();
    const files = meta["uploaded-files"];
    const creds = readJson(CREDENTIALS_PATH);
    const total = Object.keys(files).length;

    if (total === 0) return console.log(chalk.yellow("ℹ No remote files recorded. Nothing to pull."));

    console.log(chalk.blue.bold(`\n⬇  Pulling ${chalk.cyan(total)} file(s)`));
    let done = 0;
    const spinner = makeSpinner(`Downloading... 0/${total}`).start();
    const pulled = [];

    try {
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(files).map(async f => {
                    const key = path.posix.join(path.basename(process.cwd()), f);
                    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                    const dir = path.dirname(f);
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(f, await Body.transformToString());
                    pulled.push(f);
                    done += 1;
                    spinner.text = `Downloading... ${done}/${total}`;
                }));
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                const fileList = Object.keys(files).map(k => ({ name: k, ...files[k] }));
                await Promise.all(fileList.map(async f => {
                    const res = await drive.files.list({ q: `name='${path.posix.basename(f.name)}' and mimeType!='application/vnd.google-apps.folder'`, fields: 'files(id)' });
                    if (!res.data.files[0]) {
                        spinner.warn(`Missing remote file: ${f.name}`);
                        return;
                    }
                    const data = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
                    if (!existsSync(path.dirname(f.name))) mkdirSync(path.dirname(f.name), { recursive: true });
                    writeFileSync(f.name, await data.data.text());
                    pulled.push(f.name);
                    done += 1;
                    spinner.text = `Downloading... ${done}/${total}`;
                }));
            });
        }
        spinner.succeed(`Downloaded ${done}/${total}`);
    } catch (err) {
        spinner.fail("Pull failed");
        throw err;
    }

    pulled.forEach(f => console.log(chalk.green(`✔ Downloaded: ${f}`)));
}

function log() {
    checkDorkyProject();
    const history = readHistory();
    if (!history.length) return console.log(chalk.yellow("ℹ No history found. Push some files first."));
    console.log(chalk.blue.bold("\n📜 Push History:\n"));

    if (isTTY) {
        const table = new Table({
            head: [chalk.cyan("Commit"), chalk.cyan("When"), chalk.cyan("Files"), chalk.cyan("")].map(h => h),
            style: { head: [], border: ["gray"] },
            colWidths: [12, 26, 7, 12],
        });
        [...history].reverse().forEach((entry, i) => {
            const date = new Date(entry.timestamp).toLocaleString();
            const fileCount = Object.keys(entry.files).length;
            table.push([
                chalk.yellow(entry.id),
                chalk.gray(date),
                String(fileCount),
                i === 0 ? chalk.green("(latest)") : "",
            ]);
        });
        console.log(table.toString());
        console.log();
        [...history].reverse().forEach((entry, i) => {
            console.log(chalk.yellow(`commit ${entry.id}`) + (i === 0 ? chalk.green(" (latest)") : ""));
            Object.keys(entry.files).forEach(f => console.log(chalk.gray(`  • ${f}`)));
            console.log();
        });
    } else {
        [...history].reverse().forEach((entry, i) => {
            const date = new Date(entry.timestamp).toLocaleString();
            const fileCount = Object.keys(entry.files).length;
            console.log(chalk.yellow(`  commit ${entry.id}`) + (i === 0 ? chalk.green(" (latest)") : ""));
            console.log(chalk.gray(`  Date:  ${date}`));
            console.log(chalk.gray(`  Files: ${fileCount}`));
            Object.keys(entry.files).forEach(f => console.log(chalk.cyan(`    • ${f}`)));
            console.log();
        });
    }
}

async function checkout(commitId) {
    checkDorkyProject();
    if (!await checkCredentials()) return;

    const history = readHistory();
    const entry = history.find(e => e.id === commitId || e.id.startsWith(commitId));
    if (!entry) return console.log(chalk.red(`✖ Commit not found: ${commitId}. Run --log to see available commits.`));

    console.log(chalk.blue.bold(`\n⏪ Checking out commit ${entry.id} (${new Date(entry.timestamp).toLocaleString()}):\n`));

    const creds = readJson(CREDENTIALS_PATH);
    const root = path.basename(process.cwd());
    const historyPrefix = path.posix.join(root, ".dorky-history", entry.id);
    const total = Object.keys(entry.files).length;
    let done = 0;
    const spinner = makeSpinner(`Restoring... 0/${total}`).start();
    const restored = [];

    try {
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(entry.files).map(async f => {
                    const key = path.posix.join(historyPrefix, f);
                    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                    if (!existsSync(path.dirname(f))) mkdirSync(path.dirname(f), { recursive: true });
                    writeFileSync(f, await Body.transformToString());
                    restored.push(f);
                    done += 1;
                    spinner.text = `Restoring... ${done}/${total}`;
                }));
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                for (const f of Object.keys(entry.files)) {
                    const parentId = await getFolderId(path.posix.join(root, ".dorky-history", entry.id, path.posix.dirname(f)), drive, false);
                    if (!parentId) { spinner.warn(`Remote history folder missing for: ${f}`); continue; }
                    const res = await drive.files.list({
                        q: `name='${path.posix.basename(f)}' and '${parentId}' in parents and trashed=false`,
                        fields: 'files(id)'
                    });
                    if (!res.data.files[0]) { spinner.warn(`Missing remote history file: ${f}`); continue; }
                    const data = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
                    if (!existsSync(path.dirname(f))) mkdirSync(path.dirname(f), { recursive: true });
                    writeFileSync(f, await data.data.text());
                    restored.push(f);
                    done += 1;
                    spinner.text = `Restoring... ${done}/${total}`;
                }
            });
        }
        spinner.succeed(`Restored ${done}/${total}`);
    } catch (err) {
        spinner.fail("Checkout failed");
        throw err;
    }

    restored.forEach(f => console.log(chalk.green(`✔ Restored: ${f}`)));

    const meta = readMetadata();
    meta["stage-1-files"] = { ...entry.files };
    writeJson(METADATA_PATH, meta);
    console.log(chalk.cyan(`\nℹ Staged state restored to commit ${entry.id}. Run --push to publish this state.`));
}

async function destroy() {
    checkDorkyProject();
    if (!await checkCredentials()) return;

    if (isTTY) {
        const root = path.basename(process.cwd());
        const { confirmed } = await prompts({
            type: "confirm",
            name: "confirmed",
            message: `This will delete remote files for "${root}" and remove .dorky locally. Proceed?`,
            initial: false,
        });
        if (!confirmed) return console.log(chalk.yellow("ℹ Destroy cancelled."));
    }

    const creds = readJson(CREDENTIALS_PATH);
    const root = path.basename(process.cwd());
    const spinner = makeSpinner("Deleting remote project...").start();

    try {
        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root + "/" }));
                if (data.Contents && data.Contents.length > 0) {
                    const deleteParams = {
                        Bucket: bucket,
                        Delete: { Objects: data.Contents.map(o => ({ Key: o.Key })) }
                    };
                    await s3.send(new DeleteObjectsCommand(deleteParams));
                    spinner.text = "Remote files deleted";
                }
            });
        } else if (creds.storage === "google-drive") {
            await runDrive(async (drive) => {
                const q = `name='${root}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
                const { data: { files: [folder] } } = await drive.files.list({ q, fields: 'files(id)' });
                if (folder) {
                    await drive.files.delete({ fileId: folder.id });
                    spinner.text = "Remote folder deleted";
                }
            });
        }
        spinner.succeed("Remote cleaned");
    } catch (err) {
        spinner.fail("Failed to clean remote");
        throw err;
    }

    if (creds.storage === "aws") console.log(chalk.red("✖ Remote files deleted."));
    else console.log(chalk.red("✖ Remote folder deleted."));

    if (existsSync(DORKY_DIR)) rmSync(DORKY_DIR, { recursive: true, force: true });
    if (existsSync(".dorkyignore")) unlinkSync(".dorkyignore");

    console.log(chalk.red("✖ Project destroyed locally."));
}

async function interactiveMenu() {
    const initialized = existsSync(CREDENTIALS_PATH) || existsSync(DORKY_DIR) || existsSync(".dorkyignore");

    const baseChoices = initialized
        ? [
            { title: "📂 List untracked + staged files", value: "list" },
            { title: "☁  List remote files", value: "list-remote" },
            { title: "➕ Stage files (add)", value: "add" },
            { title: "➖ Unstage files (rm)", value: "rm" },
            { title: "🚀 Push staged files", value: "push" },
            { title: "⬇  Pull remote files", value: "pull" },
            { title: "📜 Show push history (log)", value: "log" },
            { title: "⏪ Checkout a commit", value: "checkout" },
            { title: "💥 Destroy project", value: "destroy" },
            { title: "Quit", value: "quit" },
        ]
        : [
            { title: "🆕 Initialize with AWS S3", value: "init-aws" },
            { title: "🆕 Initialize with Google Drive", value: "init-gd" },
            { title: "Quit", value: "quit" },
        ];

    console.log(divider());
    console.log(chalk.bold(initialized ? "  Dorky · interactive menu" : "  Dorky · welcome (no project yet)"));
    console.log(divider());

    const { action } = await prompts({
        type: "select",
        name: "action",
        message: "What would you like to do?",
        choices: baseChoices,
        hint: "Use arrow keys, Enter to select",
    });

    if (!action || action === "quit") return;

    switch (action) {
        case "init-aws": return init("aws");
        case "init-gd": return init("google-drive");
        case "list": return list();
        case "list-remote": return list("remote");
        case "log": return log();
        case "push": return push();
        case "pull": return pull();
        case "destroy": return destroy();
        case "add": {
            const { files } = await prompts({
                type: "text",
                name: "files",
                message: "Files to stage (space-separated globs):",
            });
            if (!files) return;
            const expanded = (await Promise.all(files.split(/\s+/).filter(Boolean).map(g => glob(g, { dot: true })))).flat();
            return add(expanded.length ? expanded : files.split(/\s+/).filter(Boolean));
        }
        case "rm": {
            const meta = readMetadata();
            const staged = Object.keys(meta["stage-1-files"]);
            if (!staged.length) return console.log(chalk.yellow("ℹ Nothing staged to remove."));
            const { picks } = await prompts({
                type: "multiselect",
                name: "picks",
                message: "Select files to unstage",
                choices: staged.map(s => ({ title: s, value: s })),
                hint: "Space to toggle, Enter to confirm",
                instructions: false,
            });
            if (!picks || !picks.length) return;
            return rm(picks);
        }
        case "checkout": {
            const history = readHistory();
            if (!history.length) return console.log(chalk.yellow("ℹ No history yet."));
            const { id } = await prompts({
                type: "select",
                name: "id",
                message: "Pick a commit to restore",
                choices: [...history].reverse().map((e, i) => ({
                    title: `${e.id}  ${new Date(e.timestamp).toLocaleString()}  (${Object.keys(e.files).length} files)${i === 0 ? "  ← latest" : ""}`,
                    value: e.id,
                })),
            });
            if (!id) return;
            return checkout(id);
        }
    }
}

async function main() {
    if ((noArgs && isTTY) || args.interactive) return interactiveMenu();
    if (noArgs) { yargs.showHelp(); return; }

    if (args.init !== undefined) await init(args.init);
    if (args.list !== undefined) await list(args.list);
    if (args.add !== undefined) add(args.add);
    if (args.rm !== undefined) rm(args.rm);
    if (args.push !== undefined) await push();
    if (args.pull !== undefined) await pull();
    if (args.log !== undefined) log();
    if (args.checkout !== undefined) await checkout(args.checkout);
    if (args.destroy !== undefined) await destroy();
}

main().catch(err => {
    console.log(chalk.red(`✖ ${err.message || err}`));
    process.exit(1);
});
