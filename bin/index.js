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

const figlet = `
      __            __          \t
  .--|  |-----.----|  |--.--.--.\t
  |  _  |  _  |   _|    <|  |  |\t
  |_____|_____|__| |__|__|___  |\t
                         |_____|\t
`;

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
        }
    }
    const metaData = { "stage-1-files": {}, "uploaded-files": {} };
    var credentials;
    switch (storage) {
        case "aws":
            credentials = { storage: "aws", acessKey: process.env.AWS_ACCESS_KEY, secretKey: process.env.AWS_SECRET_KEY, region: process.env.AWS_REGION };
            setupFilesAndFolders(metaData, credentials);
            break;
        case "google-drive":
            credentials = { storage: "google-drive" } // Setup credentials
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

function push() {
    console.log("Pushing files to storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    const stage1Files = metaData["stage-1-files"];
    const pushedFiles = Object.keys(metaData["stage-1-files"]).filter((file) => !Object.keys(metaData["uploaded-files"]).includes(file)); // filesToPush or pushedFiles => TP | 2024-08-09 13:36:47
    metaData["uploaded-files"] = stage1Files;
    // Push files to storage
    fs.writeFileSync(".dorky/metadata.json", JSON.stringify(metaData, null, 2));
    if (pushedFiles.length > 0) pushedFiles.map((file) => console.log(chalk.green(`Pushed ${file} to storage.`)));
    else console.log(chalk.red("No file to push"));
}

function pull() {
    console.log("Pulling files from storage");
    const metaData = JSON.parse(fs.readFileSync(".dorky/metadata.json"));
    const uploadedFiles = Object.keys(metaData["uploaded-files"]);
    console.log(uploadedFiles);
}

if (Object.keys(args).includes("init")) init(args.init);
if (Object.keys(args).includes("list")) list(args.list);
if (Object.keys(args).includes("add")) add(args.add);
if (Object.keys(args).includes("rm")) rm(args.rm);
if (Object.keys(args).includes("push")) push();
if (Object.keys(args).includes("pull")) pull();