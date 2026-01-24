#!/usr/bin/env node

const yargs = require("yargs");
const { existsSync, mkdirSync, writeFileSync } = require("fs");
const chalk = require("chalk");
const { glob } = require("glob");
const path = require("path");
const fs = require("fs");
const mimeTypes = require("mime-types");
const md5 = require('md5');
const EOL = require("os").type() == "Darwin" ? "\r\n" : "\n";
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// Google Drive config ************************************************************
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = path.join(__dirname, "../google-drive-credentials.json");
const TOKEN_PATH = path.join(process.cwd(), '.dorky/credentials.json');
// ********************************************************************************

const figlet = `
      __            __          \t
  .--|  |-----.----|  |--.--.--.\t
  |  _  |  _  |   _|    <|  |  |\t
  |_____|_____|__| |__|__|___  |\t
                         |_____|\t
`;
// Should display the process.env.AWS_ACCESS_KEY, process.env.AWS_SECRET_KEY, process.env.AWS_REGION, process.env.BUCKET_NAME to be set
const usage = `${figlet}`;
let randomColor = null;
do {
    const randomHex = Math.floor(Math.random() * 16777215).toString(16);
    randomColor = `#${randomHex}`;
} while (randomColor[2] === "f" || randomColor[3] === "f");
console.log(chalk.bgHex(randomColor)(usage));

if (process.argv.slice(2).length === 0) {
    process.argv.push("--help");
}
var args = yargs
    .option("init", { alias: "i", describe: "Initialize dorky project", type: "string", demandOption: false })
    .option("list", { alias: "l", describe: "List files in dorky", type: "string", demandOption: false })
    .option("add", { alias: "a", describe: "Add files to push or pull", type: "array", demandOption: false })
    .option("rm", { alias: "r", describe: "Remove files from push or pull", type: "array", demandOption: false })
    .option("push", { alias: "ph", describe: "Push files to storage", type: "string", demandOption: false })
    .option("pull", { alias: "pl", describe: "Pull files from storage", type: "string", demandOption: false })
    .option("migrate", { alias: "m", describe: "Migrate dorky project to another storage", type: "string", demandOption: false })
    .example('$0 --init aws', 'Initialize a dorky project with AWS storage')
    .example('$0 --init google-drive', 'Initialize a dorky project with Google Drive storage')
    .example('$0 --list', 'List local files that can be added and already added files')
    .example('$0 --list remote', 'List files in remote storage')
    .example('$0 --add file1.txt file2.js', 'Add specific files to stage-1')
    .example('$0 --rm file1.txt', 'Remove a file from stage-1')
    .example('$0 --push', 'Push staged files to storage')
    .example('$0 --pull', 'Pull files from storage')
    .example('$0 --migrate aws', 'Migrate the project to AWS storage')
    .help('help')
    .strict()
    .argv

if (Object.keys(args).length == 2) {
    yargs.showHelp()
}

function checkIfDorkyProject() {
    if (!existsSync(".dorky") && !existsSync(".dorkyignore")) {
        console.log(chalk.red("This is not a dorky project. Please run `dorky --init [aws|google-drive]` to initialize a dorky project."));
        process.exit(1);
    }
}

function setupFilesAndFolders(metaData, credentials) {
    console.log("Initializing dorky project");
    if (existsSync(".dorky")) {
        console.log("Dorky is already initialised in this project.");
    } else {
        mkdirSync(".dorky");
        console.log(chalk.bgGreen("Created .dorky folder."));
        writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
        console.log(chalk.bgGreen("Created .dorky/metadata.json file."));
        writeFileSync(".dorkyignore", "");
        console.log(chalk.bgGreen("Created .dorkyignore file."));
        writeFileSync(".dorky/credentials.json", JSON.stringify(credentials, null, 2));
        console.log(chalk.bgGreen("Created .dorky/credentials.json file."));
    }
}

function updateGitIgnore() {
    let gitignoreContent = "";
    if (existsSync(".gitignore")) {
        gitignoreContent = fs.readFileSync(".gitignore").toString();
    }
    const dorkyIgnoreEntry = ".dorky/credentials.json";
    if (!gitignoreContent.includes(dorkyIgnoreEntry)) {
        gitignoreContent += EOL + dorkyIgnoreEntry + EOL;
        fs.writeFileSync(".gitignore", gitignoreContent);
        console.log(`${chalk.bgGreen("Updated .gitignore to ignore .dorky/credentials.json.")} ${chalk.red("⚠️  This is done to protect your credentials.")}`);
    }
}

async function authorizeGoogleDriveClient(forceReauth = false) {
    async function loadSavedCredentialsIfExist() {
        try {
            const content = await fs.readFileSync(TOKEN_PATH);
            const savedCredentials = JSON.parse(content);

            // Check if this is OAuth2 credentials (has access_token, refresh_token, etc.)
            if (!savedCredentials.access_token && !savedCredentials.refresh_token) {
                return null;
            }

            // Load the client secrets to create an OAuth2 client
            const keys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
            const key = keys.installed || keys.web;
            const oAuth2Client = new google.auth.OAuth2(
                key.client_id,
                key.client_secret,
                key.redirect_uris[0]
            );

            // Remove the 'storage' field and set credentials
            const { storage, ...authCredentials } = savedCredentials;
            oAuth2Client.setCredentials(authCredentials);

            return oAuth2Client;
        } catch (err) {
            return null;
        }
    }

    async function isTokenExpired(credentials) {
        if (!credentials.expiry_date) {
            return true;
        }
        // Both Date.now() and expiry_date are in milliseconds since Unix epoch (UTC)
        // Check if token expires in less than 5 minutes (300000 ms)
        const expiryBuffer = 300000;
        const currentTimeUTC = Date.now();
        const expiryTimeUTC = credentials.expiry_date;

        // Token is expired if current time is past (expiry time - buffer)
        return currentTimeUTC >= (expiryTimeUTC - expiryBuffer);
    }

    async function refreshAndSaveToken(client) {
        try {
            await client.getAccessToken();
            const newCredentials = client.credentials;
            const credentialsToSave = {
                storage: "google-drive",
                ...newCredentials
            };
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentialsToSave, null, 2));
            return client;
        } catch (err) {
            return null;
        }
    }

    // If not forcing reauth, try to load existing credentials
    if (!forceReauth) {
        let client = await loadSavedCredentialsIfExist();
        if (client) {
            const credentials = JSON.parse(fs.readFileSync(TOKEN_PATH));

            // Ensure we're using the client's credentials which may have been updated
            const clientCredentials = client.credentials || credentials;

            if (await isTokenExpired(clientCredentials)) {
                client = await refreshAndSaveToken(client);
                if (client) {
                    return client;
                }
                // If refresh failed, fall through to full reauth
            } else {
                return client;
            }
        }
    }

    // Perform full authentication
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });

    // Save credentials after full authentication
    if (client && client.credentials) {
        const credentialsToSave = {
            storage: "google-drive",
            ...client.credentials
        };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentialsToSave, null, 2));
    }

    return client;
}

async function init(storage) {
    const metaData = { "stage-1-files": {}, "uploaded-files": {} };
    var credentials;
    switch (storage) {
        case "aws":
            credentials = { storage: "aws", accessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, awsRegion: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME }
            setupFilesAndFolders(metaData, credentials);
            break;
        case "google-drive":
            const client = await authorizeGoogleDriveClient(true); // Force reauth on init
            credentials = { storage: "google-drive", ...client.credentials };
            setupFilesAndFolders(metaData, credentials);
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
    updateGitIgnore();
}

async function list(type) {
    checkIfDorkyProject();
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    switch (type) {
        case "remote":
            const uploadedFiles = Object.keys(metaData["uploaded-files"]);
            if (uploadedFiles.length === 0) {
                console.log(chalk.red("No files found in remote storage."));
                return;
            }
            console.log(chalk.green("Listing files in stage-1:"));
            uploadedFiles.forEach((file) => console.log(chalk.green(`- ${file}`)));
            break;
        default:
            console.log(chalk.red("Listing files that can be added:"));
            var exclusions = fs.readFileSync(".dorkyignore").toString().split(EOL);
            exclusions = exclusions.filter((exclusion) => exclusion !== "");
            const src = process.cwd();
            const files = await glob(path.join(src, "**/*"), { dot: true });
            const filteredFiles = files.filter((file) => {
                for (let i = 0; i < exclusions.length; i++) {
                    if (file.includes(exclusions[i])) return false;
                }
                if (file.includes(".dorky/")) return false;
                if (file.endsWith(".dorky") && fs.lstatSync(file).isDirectory()) return false;
                if (file.endsWith(".dorkyignore")) return false;
                return true;
            });
            filteredFiles.forEach((file) => {
                const relativePath = path.relative(process.cwd(), file);
                if (relativePath.includes('.env') || relativePath.includes('.config')) {
                    console.log(chalk.bold.bgYellowBright.red(`- ${relativePath} (This file might be sensitive, please add it to dorky if needed)`));
                } else {
                    console.log(chalk.red(`- ${relativePath}`));
                }
            });
            console.log(chalk.green("\nList of files that are already added:"));
            const addedFiles = Object.keys(metaData["stage-1-files"]);
            addedFiles.forEach((file) => console.log(chalk.green(`- ${file}`)));
            break;
    }
}

function add(listOfFiles) {
    checkIfDorkyProject();
    console.log("Adding files to stage-1 to push to storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    listOfFiles.forEach((file) => {
        if (!fs.existsSync(file)) {
            console.log(chalk.red(`File ${file} does not exist.`));
            return;
        }
        const fileContents = fs.readFileSync(file);
        const fileType = mimeTypes.lookup(file);
        metaData["stage-1-files"][file] = {
            "mime-type": fileType ? fileType : "application/octet-stream",
            "hash": md5(fileContents)
        };
    });
    fs.writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
    listOfFiles.map((file) => console.log(chalk.green(`Added ${file} to stage-1.`)));
}

function rm(listOfFiles) {
    checkIfDorkyProject();
    console.log(chalk.red("Removing files from stage-1"));
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    listOfFiles = listOfFiles.filter((file) => {
        if (metaData["stage-1-files"][file] == undefined) return false;
        delete metaData["stage-1-files"][file];
        return true;
    });
    fs.writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
    if (listOfFiles.length) listOfFiles.map((file) => console.log(chalk.red(`Removed ${file} from stage-1.`)));
    else console.log(chalk.red("No files found that can be removed."));
}

async function checkCredentials() {
    try {
        if (fs.existsSync(".dorky/credentials.json")) {
            const credentials = JSON.parse(fs.readFileSync(".dorky/credentials.json"));
            if (credentials.storage === "google-drive") {
                if (credentials.access_token && credentials.scope && credentials.token_type && credentials.expiry_date) return true;
                else return false;
            } else {
                if (credentials.accessKey && credentials.secretKey && credentials.awsRegion && credentials.bucket) return true;
                else return false;
            }
        } else {
            console.log("Setting the credentials again.")
            if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY && process.env.AWS_REGION && process.env.BUCKET_NAME) {
                fs.writeFileSync(".dorky/credentials.json", JSON.stringify({
                    "storage": "aws",
                    "accessKey": process.env.AWS_ACCESS_KEY,
                    "secretKey": process.env.AWS_SECRET_KEY,
                    "awsRegion": process.env.AWS_REGION,
                    "bucket": process.env.BUCKET_NAME
                }, null, 2));
                return true;
            } else {
                try {
                    let credentials;
                    const client = await authorizeGoogleDriveClient(true); // Force reauth when creating new credentials
                    credentials = { storage: "google-drive", ...client.credentials };
                    fs.writeFileSync(".dorky/credentials.json", JSON.stringify(credentials, null, 2));
                    console.log(chalk.green("Credentials saved in .dorky/credentials.json"));
                    console.log(chalk.red("Please ignore the warning to set credentials below and run the command again."));
                    return false;
                } catch (err) {
                    console.log(chalk.red("Failed to authorize Google Drive client: " + err.message));
                    console.log(chalk.red("Please provide credentials in .dorky/credentials.json"));
                    return false;
                }
            }
        }
    } catch (err) {
        console.log(chalk.red("Please provide credentials in .dorky/credentials.json"));
        return false;
    }
}

async function push() {
    checkIfDorkyProject();
    if (!(await checkCredentials())) {
        console.log(chalk.red("Please setup credentials in environment variables or in .dorky/credentials.json"));
        return;
    }
    console.log("Pushing files to storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    const stage1Files = metaData["stage-1-files"];
    const pushedFiles = metaData["uploaded-files"];
    var filesToPush = [];
    Object.keys(stage1Files).map((file) => {
        if (pushedFiles[file]) {
            if (stage1Files[file]["hash"] != pushedFiles[file]["hash"]) filesToPush.push(file);
        } else filesToPush.push(file);
    });
    filesToPush = filesToPush.map((file) => {
        return {
            "name": file,
            "mime-type": stage1Files[file]["mime-type"],
            "hash": stage1Files[file]["hash"]
        }
    });
    const credentials = JSON.parse(fs.readFileSync(".dorky/credentials.json"));
    switch (credentials.storage) {
        case "aws":
            pushToS3(filesToPush, credentials);
            break;
        case "google-drive":
            pushToGoogleDrive(filesToPush);
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
    metaData["uploaded-files"] = metaData["stage-1-files"];
    fs.writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
    console.log(chalk.green("Pushed the following files to storage:"));
}

function pushToS3(files, credentials) {
    const s3 = new S3Client({
        credentials: {
            accessKeyId: credentials.accessKey ?? process.env.AWS_ACCESS_KEY,
            secretAccessKey: credentials.secretKey ?? process.env.AWS_SECRET_KEY
        },
        region: credentials.awsRegion ?? process.env.AWS_REGION
    });
    const bucketName = credentials.bucket ?? process.env.BUCKET_NAME;
    Promise.all(files.map(async (file) => {
        const rootFolder = path.basename(process.cwd());
        const pathToFile = path.join(rootFolder, file.name);
        await s3.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: pathToFile,
                Body: fs.readFileSync(file.name).toString(),
            })
        );
        console.log(chalk.green(`Pushed ${pathToFile} to storage.`));
    }));
}


async function pushToGoogleDrive(files) {
    async function getOrCreateFolderId(folderPath, drive) {
        const folders = folderPath.split(path.sep);
        let parentId = 'root';
        for (const folder of folders) {
            const res = await drive.files.list({
                q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            if (res.data.files.length > 0) {
                parentId = res.data.files[0].id;
            } else {
                const folderMetadata = {
                    name: folder,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId],
                };
                const folderRes = await drive.files.create({
                    requestBody: folderMetadata,
                    fields: 'id',
                });
                parentId = folderRes.data.id;
            }
        }
        return parentId;
    }
    console.log("Uploading to google drive");
    const client = await authorizeGoogleDriveClient(false); // Use existing token if valid

    // Update credentials file with potentially refreshed token
    const credentialsToSave = {
        storage: "google-drive",
        ...client.credentials
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentialsToSave, null, 2));

    const drive = google.drive({ version: 'v3', auth: client });
    for (const file of files) {
        const rootFolder = path.basename(process.cwd());
        const pathToFile = path.join(rootFolder, file.name);
        const requestBody = {
            name: path.basename(file.name),
            parents: [await getOrCreateFolderId(pathToFile.split("/").slice(0, -1).join("/"), drive)],
            fields: 'id',
        };
        const media = {
            mimeType: file["mime-type"],
            body: fs.createReadStream(path.join(process.cwd(), file.name)),
        };
        try {
            await drive.files.create({
                requestBody,
                media: media,
            });
            console.log(chalk.green(`Pushed ${file.name} to storage.`));
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}

async function pull() {
    checkIfDorkyProject();
    if (!(await checkCredentials())) {
        console.log(chalk.red("Please setup credentials in environment variables or in .dorky/credentials.json"));
        return;
    }
    console.log("Pulling files from storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    const filesToPull = metaData["uploaded-files"];
    const credentials = JSON.parse(fs.readFileSync(".dorky/credentials.json"));
    switch (credentials.storage) {
        case "aws":
            pullFromS3(filesToPull, credentials);
            break;
        case "google-drive":
            pullFromGoogleDrive(filesToPull);
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
}

function pullFromS3(files, credentials) {
    const s3 = new S3Client({
        credentials: {
            accessKeyId: credentials.accessKey ?? process.env.AWS_ACCESS_KEY,
            secretAccessKey: credentials.secretKey ?? process.env.AWS_SECRET_KEY
        },
        region: credentials.awsRegion ?? process.env.AWS_REGION
    });
    const bucketName = credentials.bucket ?? process.env.BUCKET_NAME;
    Promise.all(Object.keys(files).map(async (file) => {
        const rootFolder = path.basename(process.cwd());
        const pathToFile = path.join(rootFolder, file);
        const { Body } = await s3.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: pathToFile,
            })
        );
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(file, await Body.transformToString());
        console.log(chalk.green(`Pulled ${file} from storage.`));
    }));
}

async function pullFromGoogleDrive(files) {
    console.log("Downloading from google drive");
    files = Object.keys(files).map((file) => {
        return { name: file, ...files[file] };
    });

    const client = await authorizeGoogleDriveClient(false); // Use existing token if valid

    // Update credentials file with potentially refreshed token
    const credentialsToSave = {
        storage: "google-drive",
        ...client.credentials
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentialsToSave, null, 2));

    const drive = google.drive({ version: "v3", auth: client });
    try {
        files.map(async (file) => {
            const res = await drive.files.list({
                q: `name='${path.basename(file.name)}' and mimeType!='application/vnd.google-apps.folder'`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            if (res.data.files.length === 0) {
                console.log(chalk.red(`File ${file.name} not found in Google Drive.`));
                return;
            }
            const _file = await drive.files.get({ fileId: res.data.files[0].id, alt: "media" });
            const dir = path.dirname(file.name);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(file.name, await _file.data.text(), "utf-8");
            console.log(chalk.green(`Pulled ${file.name} from storage.`));
        });
    } catch (err) {
        throw err;
    }
}

if (Object.keys(args).includes("init")) init(args.init);
if (Object.keys(args).includes("list")) list(args.list);
if (Object.keys(args).includes("add")) add(args.add);
if (Object.keys(args).includes("rm")) rm(args.rm);
if (Object.keys(args).includes("push")) push();
if (Object.keys(args).includes("pull")) pull(); 
