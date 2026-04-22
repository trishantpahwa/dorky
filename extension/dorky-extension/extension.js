const vscode = require('vscode');
const { existsSync, mkdirSync, writeFileSync, readFileSync, createReadStream, unlinkSync, rmSync } = require('fs');
const path = require('path');
const mimeTypes = require('mime-types');
const md5 = require('md5');
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, S3Client } = require('@aws-sdk/client-s3');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const DORKY_DIR = '.dorky';
const METADATA_PATH = path.join(DORKY_DIR, 'metadata.json');
const CREDENTIALS_PATH = path.join(DORKY_DIR, 'credentials.json');
const HISTORY_PATH = path.join(DORKY_DIR, 'history.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let outputChannel;
let filesProvider;

// --- Helpers ---

function getRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return null;
    }
    return folders[0].uri.fsPath;
}

const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p)) : {};
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

function log(msg) {
    outputChannel.appendLine(msg);
    outputChannel.show(true);
}

function checkDorkyProject(root) {
    if (!existsSync(path.join(root, DORKY_DIR)) && !existsSync(path.join(root, '.dorkyignore'))) {
        vscode.window.showErrorMessage('Not a dorky project. Use the sidebar to initialize.');
        return false;
    }
    return true;
}

function updateDorkyContext(root) {
    vscode.commands.executeCommand('setContext', 'dorky.initialized', existsSync(path.join(root, DORKY_DIR)));
}

function updateGitIgnore(root) {
    const gitignorePath = path.join(root, '.gitignore');
    let content = existsSync(gitignorePath) ? readFileSync(gitignorePath).toString() : '';
    if (!content.includes(CREDENTIALS_PATH)) {
        writeFileSync(gitignorePath, content + '\n' + CREDENTIALS_PATH + '\n');
        log('ℹ Updated .gitignore to secure credentials.');
    }
}

// --- Google Drive Auth ---

async function authorizeGoogleDriveClient(root, forceReauth = false) {

    const credPath = path.join(root, CREDENTIALS_PATH);
    const gdCredPath = path.join(__dirname, 'google-drive-credentials.json');

    if (!existsSync(gdCredPath)) {
        vscode.window.showErrorMessage('google-drive-credentials.json not found in workspace root.');
        return null;
    }

    if (!forceReauth && existsSync(credPath)) {
        const saved = readJson(credPath);
        if (saved.storage === 'google-drive' && saved.expiry_date) {
            const keys = readJson(gdCredPath);
            const key = keys.installed || keys.web;
            const client = new google.auth.OAuth2(key.client_id, key.client_secret, key.redirect_uris[0]);
            client.setCredentials(saved);
            if (Date.now() >= saved.expiry_date - 300000) {
                try {
                    const { credentials } = await client.refreshAccessToken();
                    writeJson(credPath, { storage: 'google-drive', ...credentials });
                    client.setCredentials(credentials);
                } catch {
                    return authorizeGoogleDriveClient(root, true);
                }
            }
            return client;
        }
    }

    const client = await authenticate({ scopes: SCOPES, keyfilePath: gdCredPath });
    if (client?.credentials && existsSync(path.dirname(credPath))) {
        writeJson(credPath, { storage: 'google-drive', ...client.credentials });
    }
    return client;
}

// --- AWS ---

const getS3 = (c) => new S3Client({
    credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
    region: c.awsRegion
});

async function runS3(creds, fn) {
    try {
        await fn(getS3(creds), creds.bucket);
    } catch (err) {
        if (['InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(err.name) || err.$metadata?.httpStatusCode === 403) {
            log('✖ AWS authentication failed.');
            vscode.window.showErrorMessage('AWS authentication failed. Check credentials in .dorky/credentials.json');
        } else {
            throw err;
        }
    }
}

async function runDrive(root, fn) {
    let client = await authorizeGoogleDriveClient(root);
    if (!client) return;
    let drive = google.drive({ version: 'v3', auth: client });
    try {
        await fn(drive);
    } catch (err) {
        if (err.code === 401 || err.message?.includes('invalid_grant')) {
            log('Drive auth failed. Re-authenticating...');
            const credPath = path.join(root, CREDENTIALS_PATH);
            if (existsSync(credPath)) unlinkSync(credPath);
            client = await authorizeGoogleDriveClient(root, true);
            if (!client) return;
            drive = google.drive({ version: 'v3', auth: client });
            await fn(drive);
        } else {
            throw err;
        }
    }
}

async function checkCredentials(root) {
    if (existsSync(path.join(root, CREDENTIALS_PATH))) return true;
    vscode.window.showErrorMessage('Credentials not found. Initialize the project first.');
    return false;
}

async function getFolderId(pathStr, drive, create = true) {
    let parentId = 'root';
    if (!pathStr || pathStr === '.') return parentId;
    for (const folder of pathStr.split('/')) {
        if (!folder) continue;
        const res = await drive.files.list({
            q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
            fields: 'files(id)'
        });
        if (res.data.files[0]) {
            parentId = res.data.files[0].id;
        } else if (create) {
            parentId = (await drive.files.create({
                requestBody: { name: folder, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
                fields: 'id'
            })).data.id;
        } else {
            return null;
        }
    }
    return parentId;
}

// --- Tree View ---

class DorkyItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue, description, iconId) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.description = description;
        if (iconId) this.iconPath = new vscode.ThemeIcon(iconId);
    }
}

class DorkyFilesProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        const root = getRoot();
        if (!root || !existsSync(path.join(root, DORKY_DIR))) return [];

        if (!element) {
            const creds = readJson(path.join(root, CREDENTIALS_PATH));
            const meta = readJson(path.join(root, METADATA_PATH));
            const staged = Object.keys(meta['stage-1-files'] || {});
            const uploaded = Object.keys(meta['uploaded-files'] || {});
            const historyPath = path.join(root, HISTORY_PATH);
            const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath)) : [];

            const statusItem = new DorkyItem(
                creds.storage || 'unknown',
                vscode.TreeItemCollapsibleState.None,
                'status',
                'storage',
                creds.storage === 'aws' ? 'cloud' : 'globe'
            );

            const stagedSection = new DorkyItem(
                'Staged',
                vscode.TreeItemCollapsibleState.Expanded,
                'section-staged',
                `${staged.length} file(s)`,
                'git-add'
            );
            stagedSection.files = staged;

            const uploadedSection = new DorkyItem(
                'Uploaded',
                vscode.TreeItemCollapsibleState.Expanded,
                'section-uploaded',
                `${uploaded.length} file(s)`,
                'cloud'
            );
            uploadedSection.files = uploaded;

            const historySection = new DorkyItem(
                'History',
                vscode.TreeItemCollapsibleState.Collapsed,
                'section-history',
                `${history.length} commit(s)`,
                'history'
            );
            historySection.commits = [...history].reverse();

            return [statusItem, stagedSection, uploadedSection, historySection];
        }

        if (element.contextValue === 'section-staged') {
            return (element.files || []).map(f => {
                const item = new DorkyItem(f, vscode.TreeItemCollapsibleState.None, 'stagedFile', undefined, 'file');
                item.filePath = f;
                return item;
            });
        }

        if (element.contextValue === 'section-uploaded') {
            return (element.files || []).map(f =>
                new DorkyItem(f, vscode.TreeItemCollapsibleState.None, 'uploadedFile', undefined, 'file-symlink-file')
            );
        }

        if (element.contextValue === 'section-history') {
            return (element.commits || []).map((entry, i) => {
                const date = new Date(entry.timestamp).toLocaleString();
                const fileCount = Object.keys(entry.files).length;
                const item = new DorkyItem(
                    entry.id,
                    vscode.TreeItemCollapsibleState.None,
                    'historyCommit',
                    `${date} · ${fileCount} file(s)${i === 0 ? ' (latest)' : ''}`,
                    'git-commit'
                );
                item.commitId = entry.id;
                item.tooltip = Object.keys(entry.files).join('\n');
                return item;
            });
        }

        return [];
    }
}

// --- Commands ---

async function initCommand(root) {
    if (existsSync(path.join(root, DORKY_DIR))) {
        vscode.window.showWarningMessage('Dorky is already initialized.');
        return;
    }

    const storage = await vscode.window.showQuickPick(['aws', 'google-drive'], {
        placeHolder: 'Select storage backend'
    });
    if (!storage) return;

    let credentials = {};
    if (storage === 'aws') {
        const accessKey = await vscode.window.showInputBox({ prompt: 'AWS Access Key ID', ignoreFocusOut: true });
        if (!accessKey) return;
        const secretKey = await vscode.window.showInputBox({ prompt: 'AWS Secret Access Key', ignoreFocusOut: true, password: true });
        if (!secretKey) return;
        const region = await vscode.window.showInputBox({ prompt: 'AWS Region (e.g. us-east-1)', ignoreFocusOut: true });
        if (!region) return;
        const bucket = await vscode.window.showInputBox({ prompt: 'S3 Bucket Name', ignoreFocusOut: true });
        if (!bucket) return;
        credentials = { storage: 'aws', accessKey, secretKey, awsRegion: region, bucket };
    } else {
        const client = await authorizeGoogleDriveClient(root, true);
        if (!client) return;
        credentials = { storage: 'google-drive', ...client.credentials };
    }

    mkdirSync(path.join(root, DORKY_DIR));
    writeJson(path.join(root, METADATA_PATH), { 'stage-1-files': {}, 'uploaded-files': {} });
    writeJson(path.join(root, HISTORY_PATH), []);
    writeFileSync(path.join(root, '.dorkyignore'), '');
    writeJson(path.join(root, CREDENTIALS_PATH), credentials);
    updateGitIgnore(root);
    updateDorkyContext(root);
    filesProvider.refresh();
    log('✔ Dorky project initialized successfully.');
    vscode.window.showInformationMessage('Dorky initialized successfully.');
}

async function addCommand(root) {
    if (!checkDorkyProject(root)) return;

    const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        defaultUri: vscode.Uri.file(root),
        openLabel: 'Stage Files'
    });
    if (!uris || uris.length === 0) return;

    const metaPath = path.join(root, METADATA_PATH);
    const meta = readJson(metaPath);
    const added = [];

    uris.forEach(uri => {
        const absPath = uri.fsPath;
        const relPath = path.relative(root, absPath);
        if (!existsSync(absPath)) { log(`✖ File not found: ${relPath}`); return; }
        const hash = md5(readFileSync(absPath));
        if (meta['stage-1-files'][relPath]?.hash === hash) { log(`• ${relPath} (unchanged)`); return; }
        meta['stage-1-files'][relPath] = { 'mime-type': mimeTypes.lookup(relPath) || 'application/octet-stream', hash };
        added.push(relPath);
    });

    writeJson(metaPath, meta);
    added.forEach(f => log(`✔ Staged: ${f}`));
    if (added.length > 0) {
        filesProvider.refresh();
        vscode.window.showInformationMessage(`Staged ${added.length} file(s).`);
    }
}

async function rmFileCommand(item) {
    const root = getRoot();
    if (!root || !checkDorkyProject(root)) return;

    const metaPath = path.join(root, METADATA_PATH);
    const meta = readJson(metaPath);
    let filesToRemove = [];

    if (item?.filePath) {
        filesToRemove = [item.filePath];
    } else {
        const staged = Object.keys(meta['stage-1-files'] || {});
        if (staged.length === 0) { vscode.window.showInformationMessage('No staged files to remove.'); return; }
        const selected = await vscode.window.showQuickPick(staged, { canPickMany: true, placeHolder: 'Select files to unstage' });
        if (!selected?.length) return;
        filesToRemove = selected;
    }

    filesToRemove.forEach(f => {
        delete meta['stage-1-files'][f];
        log(`✔ Unstaged: ${f}`);
    });

    writeJson(metaPath, meta);
    filesProvider.refresh();
    vscode.window.showInformationMessage(`Unstaged ${filesToRemove.length} file(s).`);
}

async function pushCommand(root) {
    if (!checkDorkyProject(root)) return;
    if (!await checkCredentials(root)) return;

    const metaPath = path.join(root, METADATA_PATH);
    const meta = readJson(metaPath);
    const filesToUpload = Object.keys(meta['stage-1-files'])
        .filter(f => !meta['uploaded-files'][f] || meta['stage-1-files'][f].hash !== meta['uploaded-files'][f].hash)
        .map(f => ({ name: f, ...meta['stage-1-files'][f] }));
    const filesToDelete = Object.keys(meta['uploaded-files']).filter(f => !meta['stage-1-files'][f]);

    if (filesToUpload.length === 0 && filesToDelete.length === 0) {
        log('ℹ Nothing to push.');
        vscode.window.showInformationMessage('Nothing to push.');
        return;
    }

    const creds = readJson(path.join(root, CREDENTIALS_PATH));
    const projectName = path.basename(root);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Dorky: Pushing files...',
        cancellable: false
    }, async () => {
        if (creds.storage === 'aws') {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(filesToUpload.map(async f => {
                    const key = path.join(projectName, f.name).replace(/\\/g, '/');
                    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(path.join(root, f.name)) }));
                    log(`✔ Uploaded: ${f.name}`);
                }));
                await Promise.all(filesToDelete.map(async f => {
                    const key = path.join(projectName, f).replace(/\\/g, '/');
                    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
                    log(`✔ Deleted remote: ${f}`);
                }));
            });
        } else if (creds.storage === 'google-drive') {
            await runDrive(root, async (drive) => {
                for (const f of filesToUpload) {
                    const parentId = await getFolderId(path.dirname(path.join(projectName, f.name)), drive);
                    await drive.files.create({
                        requestBody: { name: path.basename(f.name), parents: [parentId] },
                        media: { mimeType: f['mime-type'], body: createReadStream(path.join(root, f.name)) }
                    });
                    log(`✔ Uploaded: ${f.name}`);
                }
                for (const f of filesToDelete) {
                    const parentId = await getFolderId(path.dirname(path.join(projectName, f)), drive, false);
                    if (parentId) {
                        const res = await drive.files.list({
                            q: `name='${path.basename(f)}' and '${parentId}' in parents and trashed=false`,
                            fields: 'files(id)'
                        });
                        if (res.data.files[0]) {
                            await drive.files.delete({ fileId: res.data.files[0].id });
                            log(`✔ Deleted remote: ${f}`);
                        }
                    }
                }
            });
        }

        meta['uploaded-files'] = { ...meta['stage-1-files'] };
        writeJson(metaPath, meta);

        const commitFiles = { ...meta['stage-1-files'] };
        const commitId = md5(JSON.stringify(commitFiles)).slice(0, 8);
        const historyPath = path.join(root, HISTORY_PATH);
        const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath)) : [];
        if (!history.find(e => e.id === commitId)) {
            history.push({ id: commitId, timestamp: new Date().toISOString(), files: commitFiles });
            writeJson(historyPath, history);

            const historyPrefix = path.join(projectName, '.dorky-history', commitId);
            if (creds.storage === 'aws') {
                await runS3(creds, async (s3, bucket) => {
                    await Promise.all(Object.keys(commitFiles).map(async f => {
                        const key = path.join(historyPrefix, f).replace(/\\/g, '/');
                        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(path.join(root, f)) }));
                    }));
                });
            } else if (creds.storage === 'google-drive') {
                await runDrive(root, async (drive) => {
                    for (const f of Object.keys(commitFiles)) {
                        const parentId = await getFolderId(path.join(projectName, '.dorky-history', commitId, path.dirname(f)), drive);
                        await drive.files.create({
                            requestBody: { name: path.basename(f), parents: [parentId] },
                            media: { mimeType: commitFiles[f]['mime-type'], body: createReadStream(path.join(root, f)) }
                        });
                    }
                });
            }
            log(`ℹ History commit saved: ${commitId}`);
        }

        filesProvider.refresh();
        vscode.window.showInformationMessage('Push complete.');
    });
}

async function pullCommand(root) {
    if (!checkDorkyProject(root)) return;
    if (!await checkCredentials(root)) return;

    const metaPath = path.join(root, METADATA_PATH);
    const meta = readJson(metaPath);
    const files = meta['uploaded-files'];
    const creds = readJson(path.join(root, CREDENTIALS_PATH));
    const projectName = path.basename(root);

    if (Object.keys(files).length === 0) {
        log('ℹ Nothing to pull.');
        vscode.window.showInformationMessage('Nothing to pull.');
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Dorky: Pulling files...',
        cancellable: false
    }, async () => {
        if (creds.storage === 'aws') {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(files).map(async f => {
                    const key = path.join(projectName, f).replace(/\\/g, '/');
                    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                    const dir = path.dirname(path.join(root, f));
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(path.join(root, f), await Body.transformToString());
                    log(`✔ Downloaded: ${f}`);
                }));
            });
        } else if (creds.storage === 'google-drive') {
            await runDrive(root, async (drive) => {
                const fileList = Object.keys(files).map(k => ({ name: k, ...files[k] }));
                await Promise.all(fileList.map(async f => {
                    const res = await drive.files.list({
                        q: `name='${path.basename(f.name)}' and mimeType!='application/vnd.google-apps.folder'`,
                        fields: 'files(id)'
                    });
                    if (!res.data.files[0]) { log(`✖ Missing remote file: ${f.name}`); return; }
                    const data = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
                    const dir = path.dirname(path.join(root, f.name));
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(path.join(root, f.name), await data.data.text());
                    log(`✔ Downloaded: ${f.name}`);
                }));
            });
        }
        filesProvider.refresh();
        vscode.window.showInformationMessage('Pull complete.');
    });
}

async function listRemoteCommand(root) {
    if (!checkDorkyProject(root)) return;
    if (!await checkCredentials(root)) return;

    const creds = readJson(path.join(root, CREDENTIALS_PATH));
    const projectName = path.basename(root);
    log('\n☁  Remote Files:');

    if (creds.storage === 'aws') {
        await runS3(creds, async (s3, bucket) => {
            const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: projectName + '/' }));
            if (!data.Contents?.length) { log('ℹ No remote files found.'); return; }
            data.Contents.forEach(o => log(`   ${o.Key.replace(projectName + '/', '')}`));
        });
    } else {
        await runDrive(root, async (drive) => {
            const q = `name='${projectName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
            const { data: { files: [folder] } } = await drive.files.list({ q, fields: 'files(id)' });
            if (!folder) { log('ℹ Remote folder not found.'); return; }
            const walk = async (pid, p = '') => {
                const { data: { files } } = await drive.files.list({
                    q: `'${pid}' in parents and trashed=false`,
                    fields: 'files(id, name, mimeType)'
                });
                for (const f of files) {
                    if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id, path.join(p, f.name));
                    else log(`   ${path.join(p, f.name)}`);
                }
            };
            await walk(folder.id);
        });
    }
}

function logCommand(root) {
    if (!checkDorkyProject(root)) return;
    const historyPath = path.join(root, HISTORY_PATH);
    const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath)) : [];
    if (!history.length) {
        log('ℹ No history found. Push some files first.');
        vscode.window.showInformationMessage('No history yet. Push some files first.');
        return;
    }
    log('\n📜 Push History:\n');
    [...history].reverse().forEach((entry, i) => {
        const date = new Date(entry.timestamp).toLocaleString();
        const fileCount = Object.keys(entry.files).length;
        log(`  commit ${entry.id}${i === 0 ? ' (latest)' : ''}`);
        log(`  Date:  ${date}`);
        log(`  Files: ${fileCount}`);
        Object.keys(entry.files).forEach(f => log(`    • ${f}`));
        log('');
    });
}

async function checkoutCommand(root, item) {
    if (!checkDorkyProject(root)) return;
    if (!await checkCredentials(root)) return;

    const historyPath = path.join(root, HISTORY_PATH);
    const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath)) : [];
    if (!history.length) {
        vscode.window.showInformationMessage('No history found. Push some files first.');
        return;
    }

    let entry;
    if (item?.commitId) {
        entry = history.find(e => e.id === item.commitId);
    } else {
        const picks = [...history].reverse().map(e => ({
            label: `$(git-commit) ${e.id}`,
            description: new Date(e.timestamp).toLocaleString(),
            detail: `${Object.keys(e.files).length} file(s): ${Object.keys(e.files).join(', ')}`,
            entry: e
        }));
        const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a commit to restore' });
        if (!selected) return;
        entry = selected.entry;
    }

    if (!entry) { vscode.window.showErrorMessage('Commit not found.'); return; }

    const creds = readJson(path.join(root, CREDENTIALS_PATH));
    const projectName = path.basename(root);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Dorky: Restoring commit ${entry.id}...`,
        cancellable: false
    }, async () => {
        if (creds.storage === 'aws') {
            await runS3(creds, async (s3, bucket) => {
                await Promise.all(Object.keys(entry.files).map(async f => {
                    const key = path.join(projectName, '.dorky-history', entry.id, f).replace(/\\/g, '/');
                    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                    const dir = path.dirname(path.join(root, f));
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(path.join(root, f), await Body.transformToString());
                    log(`✔ Restored: ${f}`);
                }));
            });
        } else if (creds.storage === 'google-drive') {
            await runDrive(root, async (drive) => {
                for (const f of Object.keys(entry.files)) {
                    const parentId = await getFolderId(path.join(projectName, '.dorky-history', entry.id, path.dirname(f)), drive, false);
                    if (!parentId) { log(`✖ Remote history folder missing for: ${f}`); continue; }
                    const res = await drive.files.list({
                        q: `name='${path.basename(f)}' and '${parentId}' in parents and trashed=false`,
                        fields: 'files(id)'
                    });
                    if (!res.data.files[0]) { log(`✖ Missing remote history file: ${f}`); continue; }
                    const data = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
                    const dir = path.dirname(path.join(root, f));
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    writeFileSync(path.join(root, f), await data.data.text());
                    log(`✔ Restored: ${f}`);
                }
            });
        }

        const metaPath = path.join(root, METADATA_PATH);
        const meta = readJson(metaPath);
        meta['stage-1-files'] = { ...entry.files };
        meta['uploaded-files'] = { ...entry.files };
        writeJson(metaPath, meta);
        filesProvider.refresh();
        log(`ℹ Staged and uploaded state restored to commit ${entry.id}.`);
        vscode.window.showInformationMessage(`Restored to commit ${entry.id}.`);
    });
}

async function destroyCommand(root) {
    if (!checkDorkyProject(root)) return;

    const confirm = await vscode.window.showWarningMessage(
        'This will delete all remote files and local dorky configuration. This cannot be undone.',
        { modal: true },
        'Yes, Destroy'
    );
    if (confirm !== 'Yes, Destroy') return;

    if (!await checkCredentials(root)) return;

    const creds = readJson(path.join(root, CREDENTIALS_PATH));
    const projectName = path.basename(root);

    if (creds.storage === 'aws') {
        await runS3(creds, async (s3, bucket) => {
            const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: projectName + '/' }));
            if (data.Contents?.length > 0) {
                await s3.send(new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: data.Contents.map(o => ({ Key: o.Key })) }
                }));
                log('✖ Remote files deleted.');
            }
        });
    } else if (creds.storage === 'google-drive') {
        await runDrive(root, async (drive) => {
            const q = `name='${projectName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
            const { data: { files: [folder] } } = await drive.files.list({ q, fields: 'files(id)' });
            if (folder) {
                await drive.files.delete({ fileId: folder.id });
                log('✖ Remote folder deleted.');
            }
        });
    }

    const dorkyDir = path.join(root, DORKY_DIR);
    const dorkyIgnore = path.join(root, '.dorkyignore');
    if (existsSync(dorkyDir)) rmSync(dorkyDir, { recursive: true, force: true });
    if (existsSync(dorkyIgnore)) unlinkSync(dorkyIgnore);

    updateDorkyContext(root);
    filesProvider.refresh();
    log('✖ Project destroyed.');
    vscode.window.showInformationMessage('Dorky project destroyed.');
}

// --- Activate ---

function activate(context) {
    outputChannel = vscode.window.createOutputChannel('Dorky');
    filesProvider = new DorkyFilesProvider();

    const root = getRoot();
    if (root) updateDorkyContext(root);

    vscode.window.registerTreeDataProvider('dorky.filesView', filesProvider);

    const commands = [
        ['dorky-extension.init', async () => { const r = getRoot(); if (r) await initCommand(r); }],
        ['dorky-extension.add', async () => { const r = getRoot(); if (r) await addCommand(r); }],
        ['dorky-extension.rmFile', async (item) => await rmFileCommand(item)],
        ['dorky-extension.push', async () => { const r = getRoot(); if (r) await pushCommand(r); }],
        ['dorky-extension.pull', async () => { const r = getRoot(); if (r) await pullCommand(r); }],
        ['dorky-extension.listRemote', async () => { const r = getRoot(); if (r) await listRemoteCommand(r); }],
        ['dorky-extension.log', () => { const r = getRoot(); if (r) logCommand(r); }],
        ['dorky-extension.checkout', async (item) => { const r = getRoot(); if (r) await checkoutCommand(r, item); }],
        ['dorky-extension.refresh', () => { const r = getRoot(); if (r) { updateDorkyContext(r); filesProvider.refresh(); } }],
        ['dorky-extension.destroy', async () => { const r = getRoot(); if (r) await destroyCommand(r); }],
    ];

    for (const [id, handler] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }

    context.subscriptions.push(outputChannel);
}

function deactivate() { }

module.exports = { activate, deactivate };
