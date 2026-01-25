#!/usr/bin/env node

const yargs = require("yargs");
const { existsSync, mkdirSync, writeFileSync, readFileSync, createReadStream, unlinkSync } = require("fs");
const chalk = require("chalk");
const { glob } = require("glob");
const path = require("path");
const mimeTypes = require("mime-types");
const md5 = require('md5');
const EOL = require("os").type() == "Darwin" ? "\r\n" : "\n";
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// Constants & Config
const DORKY_DIR = ".dorky";
const METADATA_PATH = path.join(DORKY_DIR, "metadata.json");
const CREDENTIALS_PATH = path.join(DORKY_DIR, "credentials.json");
const GD_CREDENTIALS_PATH = path.join(__dirname, "../google-drive-credentials.json");
const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Helpers
const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p)) : {};
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

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
let randomColor = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
while (randomColor[2] === "f" || randomColor[3] === "f") randomColor = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
console.log(chalk.bgHex(randomColor)(figlet));

const args = yargs
    .option("init", { alias: "i", describe: "Initialize dorky", type: "string" })
    .option("list", { alias: "l", describe: "List files", type: "string" })
    .option("add", { alias: "a", describe: "Add files", type: "array" })
    .option("rm", { alias: "r", describe: "Remove files", type: "array" })
    .option("push", { alias: "ph", describe: "Push files", type: "string" })
    .option("pull", { alias: "pl", describe: "Pull files", type: "string" })
    .option("migrate", { alias: "m", describe: "Migrate project", type: "string" })
    .help('help').strict().argv;

if (Object.keys(args).length === 2 && args._.length === 0) yargs.showHelp();

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
    if (existsSync(DORKY_DIR)) return console.log(chalk.yellow("⚠ Dorky is already initialized."));
    if (!["aws", "google-drive"].includes(storage)) return console.log(chalk.red("✖ Invalid storage. Use 'aws' or 'google-drive'."));

    let credentials = {};
    if (storage === "aws") {
        if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY || !process.env.AWS_REGION || !process.env.BUCKET_NAME) {
            console.log(chalk.red("✖ Missing AWS environment variables."));
            return;
        }
        credentials = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME };
    } else {
        const client = await authorizeGoogleDriveClient(true);
        credentials = { storage: "google-drive", ...client.credentials };
    }

    mkdirSync(DORKY_DIR);
    writeJson(METADATA_PATH, { "stage-1-files": {}, "uploaded-files": {} });
    writeFileSync(".dorkyignore", "");
    writeJson(CREDENTIALS_PATH, credentials);
    console.log(chalk.green("✔ Dorky project initialized successfully."));
    updateGitIgnore();
}

async function list(type) {
    checkDorkyProject();
    const meta = readJson(METADATA_PATH);
    if (type === "remote") {
        if (!await checkCredentials()) return;
        const creds = readJson(CREDENTIALS_PATH);
        const root = path.basename(process.cwd());
        console.log(chalk.blue.bold("\n☁  Remote Files:"));

        if (creds.storage === "aws") {
            await runS3(creds, async (s3, bucket) => {
                const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root + "/" }));
                if (!data.Contents?.length) return console.log(chalk.yellow("ℹ No remote files found."));
                data.Contents.forEach(o => console.log(chalk.cyan(`   ${o.Key.replace(root + "/", "")}`)));
            });
        } else {
            await runDrive(async (drive) => {
                const q = `name='${root}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
                const { data: { files: [folder] } } = await drive.files.list({ q, fields: 'files(id)' });
                if (!folder) return console.log(chalk.yellow("ℹ Remote folder not found."));
                const walk = async (pid, p = '') => {
                    const { data: { files } } = await drive.files.list({ q: `'${pid}' in parents and trashed=false`, fields: 'files(id, name, mimeType)' });
                    for (const f of files) {
                        if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id, path.join(p, f.name));
                        else console.log(chalk.cyan(`   ${path.join(p, f.name)}`));
                    }
                };
                await walk(folder.id);
            });
        }
    } else {
        console.log(chalk.blue.bold("\n📂 Untracked Files:"));
        const exclusions = existsSync(".dorkyignore") ? readFileSync(".dorkyignore").toString().split(EOL).filter(Boolean) : [];
        const files = await glob("**/*", { dot: true, ignore: [...exclusions.map(e => `**/${e}/**`), ...exclusions, ".dorky/**", ".dorkyignore", ".git/**", "node_modules/**"] });

        files.forEach(f => {
            const rel = path.relative(process.cwd(), f);
            if (rel.includes('.env') || rel.includes('.config')) console.log(chalk.yellow(`   ⚠ ${rel} (Potential sensitive file)`));
            else console.log(chalk.gray(`   ${rel}`));
        });
        console.log(chalk.blue.bold("\n📦 Staged Files:"));
        Object.keys(meta["stage-1-files"]).forEach(f => console.log(chalk.green(`   ✔ ${f}`)));
    }
}

function add(files) {
    checkDorkyProject();
    const meta = readJson(METADATA_PATH);
    const added = [];
    files.forEach(f => {
        if (!existsSync(f)) return console.log(chalk.red(`✖ File not found: ${f}`));
        const hash = md5(readFileSync(f));
        if (meta["stage-1-files"][f]?.hash === hash) return console.log(chalk.gray(`• ${f} (unchanged)`));
        meta["stage-1-files"][f] = { "mime-type": mimeTypes.lookup(f) || "application/octet-stream", hash };
        added.push(f);
    });
    writeJson(METADATA_PATH, meta);
    added.forEach(f => console.log(chalk.green(`✔ Staged: ${f}`)));
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
    const meta = readJson(METADATA_PATH);
    const filesToUpload = Object.keys(meta["stage-1-files"])
        .filter(f => !meta["uploaded-files"][f] || meta["stage-1-files"][f].hash !== meta["uploaded-files"][f].hash)
        .map(f => ({ name: f, ...meta["stage-1-files"][f] }));

    const filesToDelete = Object.keys(meta["uploaded-files"])
        .filter(f => !meta["stage-1-files"][f]);

    if (filesToUpload.length === 0 && filesToDelete.length === 0) return console.log(chalk.yellow("ℹ Nothing to push."));

    const creds = readJson(CREDENTIALS_PATH);
    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            if (filesToUpload.length > 0) {
                await Promise.all(filesToUpload.map(async f => {
                    const key = path.join(path.basename(process.cwd()), f.name);
                    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(f.name) }));
                    console.log(chalk.green(`✔ Uploaded: ${f.name}`));
                }));
            }
            if (filesToDelete.length > 0) {
                await Promise.all(filesToDelete.map(async f => {
                    const key = path.join(path.basename(process.cwd()), f);
                    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
                    console.log(chalk.yellow(`✔ Deleted remote: ${f}`));
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
                    console.log(chalk.green(`✔ Uploaded: ${f.name}`));
                }
            }
            if (filesToDelete.length > 0) {
                const root = path.basename(process.cwd());
                for (const f of filesToDelete) {
                    const parentId = await getFolderId(path.dirname(path.join(root, f)), drive, false);
                    if (parentId) {
                        const res = await drive.files.list({
                            q: `name='${path.basename(f)}' and '${parentId}' in parents and trashed=false`,
                            fields: 'files(id)'
                        });
                        if (res.data.files[0]) {
                            await drive.files.delete({ fileId: res.data.files[0].id });
                            console.log(chalk.yellow(`✔ Deleted remote: ${f}`));
                        }
                    }
                }
            }
        });
    }

    meta["uploaded-files"] = { ...meta["stage-1-files"] };
    writeJson(METADATA_PATH, meta);
}

async function pull() {
    checkDorkyProject();
    if (!await checkCredentials()) return;
    const meta = readJson(METADATA_PATH);
    const files = meta["uploaded-files"];
    const creds = readJson(CREDENTIALS_PATH);

    if (creds.storage === "aws") {
        await runS3(creds, async (s3, bucket) => {
            await Promise.all(Object.keys(files).map(async f => {
                const key = path.join(path.basename(process.cwd()), f);
                const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                const dir = path.dirname(f);
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                writeFileSync(f, await Body.transformToString());
                console.log(chalk.green(`✔ Downloaded: ${f}`));
            }));
        });
    } else if (creds.storage === "google-drive") {
        await runDrive(async (drive) => {
            const fileList = Object.keys(files).map(k => ({ name: k, ...files[k] }));
            await Promise.all(fileList.map(async f => {
                const res = await drive.files.list({ q: `name='${path.basename(f.name)}' and mimeType!='application/vnd.google-apps.folder'`, fields: 'files(id)' });
                if (!res.data.files[0]) return console.log(chalk.red(`✖ Missing remote file: ${f.name}`));
                const data = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
                if (!existsSync(path.dirname(f.name))) mkdirSync(path.dirname(f.name), { recursive: true });
                writeFileSync(f.name, await data.data.text());
                console.log(chalk.green(`✔ Downloaded: ${f.name}`));
            }));
        });
    }
}

if (args.init !== undefined) init(args.init);
if (args.list !== undefined) list(args.list);
if (args.add !== undefined) add(args.add);
if (args.rm !== undefined) rm(args.rm);
if (args.push !== undefined) push();
if (args.pull !== undefined) pull();
