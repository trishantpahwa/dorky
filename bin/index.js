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
// randomColor[2].match(/[a-f]/g).length ? true : false || randomColor[3].match(/[a-f]/g).length ? true : false
console.log(chalk.bgHex(randomColor)(usage));

if (process.argv.slice(2).length === 0) {
    process.argv.push("--help");
}

var args = yargs
    .help('help')
    .option("init", { alias: "i", describe: "Initialize dorky project", type: "string", demandOption: false })
    .option("list", { alias: "l", describe: "List files in dorky", type: "string", demandOption: false })
    .option("add", { alias: "a", describe: "Add files to push or pull", type: "array", demandOption: false })
    .option("rm", { alias: "r", describe: "Remove files from push or pull", type: "array", demandOption: false })
    .option("push", { alias: "ph", describe: "Push files to storage", type: "string", demandOption: false })
    .option("pull", { alias: "pl", describe: "Pull files from storage", type: "string", demandOption: false })
    .option("migrate", { alias: "m", describe: "Migrate dorky project to another storage", type: "string", demandOption: false })
    .argv;

function init(storage) {
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
    const metaData = { "stage-1-files": {}, "uploaded-files": {} };
    var credentials;
    switch (storage) {
        case "aws":
            credentials = { storage: "aws", acessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, region: process.env.AWS_REGION, bucket: process.env.BUCKET_NAME }
            setupFilesAndFolders(metaData, credentials);
            break;
        case "google-drive":
            credentials = { storage: "google-drive" } // Setup credentials => TP | 2024-09-28 16:04:51
            setupFilesAndFolders(metaData, credentials);
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
}

async function list() {
    console.log(chalk.red("Listing files that can be added:"));
    const exclusions = fs.readFileSync(".dorkyignore").toString().split(EOL);
    const src = process.cwd();
    const files = await glob(path.join(src, "**/*"));
    const filteredFiles = files.filter((file) => {
        for (let i = 0; i < exclusions.length; i++) {
            if (file.includes(exclusions[i])) return false;
        }
        return true;
    });
    filteredFiles.forEach((file) => console.log(chalk.red(`- ${file}`)));
    console.log(chalk.green("\nList of files that are already added:"));
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    const addedFiles = Object.keys(metaData["stage-1-files"]);
    addedFiles.forEach((file) => console.log(chalk.green(`- ${file}`)));
}

function add(listOfFiles) {
    console.log("Adding files to stage-1 to push to storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    listOfFiles.forEach((file) => {
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

function checkCredentials() {
    const credentials = JSON.parse(fs.readFileSync(".dorky/credentials.json"));
    // This only works for AWS S3, add credential checker for google drive also, fix this => TP | 2024-09-28 16:04:41
    if (credentials.accessKey && credentials.secretKey && credentials.region && credentials.bucket) {
        if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY && process.env.AWS_REGION && process.env.BUCKET_NAME) {
            return true;
        } else {
            console.log(chalk.red("Please provide credentials in .dorky/credentials.json"));
            return false;
        }
    } else return true;
}

function push() {
    if (!checkCredentials()) {
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
    if (filesToPush.length == 0) {
        console.log(chalk.red("No files to push"));
        return;
    }
    switch (credentials.storage) {
        case "aws":
            pushToS3(filesToPush, credentials);
            break;
        case "google-drive":
            pushToGoogleDrive(filesToPush, credentials);
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
    metaData["uploaded-files"] = metaData["stage-1-files"];
    fs.writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
    console.log(chalk.green("Pushed files to storage"));
}

function pushToS3(files, credentials) {
    const s3 = new S3Client({
        credentials: {
            accessKeyId: credentials.acessKey ?? process.env.AWS_ACCESS_KEY,
            secretAccessKey: credentials.secretKey ?? process.env.AWS_SECRET_KEY
        },
        region: credentials.awsRegion ?? process.env.AWS_REGION
    });
    const bucketName = credentials.bucket ?? process.env.BUCKET_NAME;
    Promise.all(files.map(async (file) => {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: file.name,
                Body: fs.readFileSync(file.name).toString(),
            })
        );
        console.log(chalk.green(`Pushed ${file.name} to storage.`));
    }));
}

function pushToGoogleDrive(files, credentials) {
    console.log("Uploading to google drive");
}

function pull() {
    if (!checkCredentials()) {
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
            pullFromGoogleDrive();
            break;
        default:
            console.log("Please provide a valid storage option <aws|google-drive>");
            break;
    }
}

function pullFromS3(files, credentials) {
    const s3 = new S3Client({
        credentials: {
            accessKeyId: credentials.acessKey ?? process.env.AWS_ACCESS_KEY,
            secretAccessKey: credentials.secretKey ?? process.env.AWS_SECRET_KEY
        },
        region: credentials.awsRegion ?? process.env.AWS_REGION
    });
    const bucketName = credentials.bucket ?? process.env.BUCKET_NAME;
    Promise.all(Object.keys(files).map(async (file) => {
        const { Body } = await s3.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: file,
            })
        );
        fs.writeFileSync(file, await Body.transformToString());
        console.log(chalk.green(`Pulled ${file} from storage.`));
    }));
}

function pullFromGoogleDrive(files, credentials) {
    console.log("Downloading from google drive");
}

if (Object.keys(args).includes("init")) init(args.init);
if (Object.keys(args).includes("list")) list(args.list);
if (Object.keys(args).includes("add")) add(args.add);
if (Object.keys(args).includes("rm")) rm(args.rm);
if (Object.keys(args).includes("push")) push();
if (Object.keys(args).includes("pull")) pull();