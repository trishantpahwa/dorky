#!/usr/bin/env node

const glob = require("glob");
const path = require("path");
const chalk = require("chalk");
const fs = require("fs");
const { EOL } = require("os");
const {
  S3Client,
  ListObjectsCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { exit } = require("process");
const { createHash } = require("crypto");

let s3Client, bucketName;

// Initializes project, creates a new .dorky folder, and adds a metadata file to it, and creates a .dorkyignore file.
function initializeProject() {
  if (fs.existsSync(".dorky")) {
    console.log(
      "Dorky project already initialized. Remove .dorky folder to reinitialize."
    );
  } else {
    fs.mkdirSync(".dorky");
    console.log(chalk.bgGreen("Created .dorky folder."));
    fs.writeFileSync(
      ".dorky/metadata.json",
      JSON.stringify({ "stage-1-files": [], "uploaded-files": [] })
    );
    console.log(chalk.bgGreen("Created .dorky/metadata.json file."));
    fs.writeFileSync(".dorkyignore", "");
    console.log(chalk.bgGreen("Created .dorkyignore file."));
    fs.writeFileSync(".dorky/.dorkyhash", "");
    console.log(chalk.bgGreen("Created .dorkyhash file."));
  }
}

// Lists all the files that are not excluded explicitly.
function listFiles() {
  let exclusions = fs.readFileSync("./.dorkyignore").toString().split(EOL);
  exclusions = exclusions.filter((exclusion) => exclusion !== "");
  if (exclusions[0] == "") exclusions = [];
  var getDirectories = function (src, callback) {
    glob(src + "/**/*", callback);
  };

  function excludeIsPresent(element) {
    let present = false;
    let i = 0;
    while (i < exclusions.length) {
      if (element.includes(exclusions[i])) present = true;
      i += 1;
    }
    return present;
  }
  getDirectories(process.cwd(), function (err, res) {
    if (err) {
      console.log("Error", err);
    } else {
      let listOfFiles;
      listOfFiles = res
        .filter((element) => !excludeIsPresent(element))
        .map((file) => path.relative(process.cwd(), file));
      console.log(chalk.green("Found files:"));
      listOfFiles.map((file) => console.log("\t" + chalk.bgGrey(file)));
    }
  });
}

// Pushes changes to S3 bucket.
function pushChanges() {
  console.log("Pushing files to server.");
  let rootFolder;
  if (process.cwd().includes("\\")) {
    rootFolder = process.cwd().split("\\").pop();
  } else if (process.cwd().includes("/")) {
    rootFolder = process.cwd().split("/").pop();
  } else rootFolder = process.cwd();
  console.log(rootFolder);
  async function rootFolderExists(rootFolder) {
    const bucketParams = { Bucket: bucketName };
    const response = await s3Client.send(new ListObjectsCommand(bucketParams));
    if (
      response.Contents.filter(
        (object) => object.Key.split("/")[0] == rootFolder
      ).length > 0
    ) {
      let metaData = JSON.parse(
        fs.readFileSync(path.join(".dorky", "metadata.json")).toString()
      );
      // Get removed files
      let removed = metaData["uploaded-files"].filter(
        (x) => !metaData["stage-1-files"].includes(x)
      );
      // Uploaded added files.
      let added = metaData["stage-1-files"].filter(
        (x) => !metaData["uploaded-files"].includes(x)
      );

      added.map(async (file) => {
        if (metaData["uploaded-files"].includes(file)) return;
        else {
          const putObjectParams = {
            Bucket: bucketName,
            Key: path
              .join(rootFolder, path.relative(process.cwd(), file))
              .split("\\")
              .join("/"),
            Body: fs
              .readFileSync(path.relative(process.cwd(), file))
              .toString(),
          };
          // Upload records
          try {
            const uploadResponse = await s3Client.send(
              new PutObjectCommand(putObjectParams)
            );
            if (uploadResponse) console.log(chalk.green("Uploaded " + file));
          } catch (err) {
            console.log(
              "Unable to upload file " +
              path
                .join(rootFolder, path.relative(process.cwd(), file))
                .replace(/\\/g, "/")
            );
            console.log(err);
          }
          metaData["uploaded-files"].push(file);
        }
      });

      if (removed.length) {
        const removedObjectParams = {
          Bucket: bucketName,
          Delete: {
            Objects: removed.map((file) => {
              return { Key: file };
            }),
            Quiet: true,
          },
        };

        // Delete removed records, doesn't delete immediately.
        try {
          const deleteResponse = s3Client.send(
            new DeleteObjectsCommand(removedObjectParams)
          );
          if (deleteResponse) {
            console.log("Deleted removed files:");
            removed.map((file) => console.log(chalk.bgRed(file)));
          }
        } catch (err) {
          console.log("Unable to delete files.");
          console.log(err);
        }
      }
      if (metaData["uploaded-files"] != metaData["stage-1-files"]) {
        metaData["uploaded-files"] = Array.from(
          new Set(metaData["stage-1-files"])
        );
        fs.writeFileSync(
          path.join(".dorky", "metadata.json"),
          JSON.stringify(metaData)
        );
        putObjectParams = {
          Bucket: bucketName,
          Key: path
            .relative(
              process.cwd(),
              path.join(rootFolder.toString(), "metadata.json")
            )
            .replace(/\\/g, "/"),
          Body: JSON.stringify(metaData),
        };
        try {
          const uploadResponse = await s3Client.send(
            new PutObjectCommand(putObjectParams)
          );
          if (uploadResponse)
            console.log(
              chalk.green(
                "Uploaded " + path.join(rootFolder.toString(), "metadata.json")
              )
            );
        } catch (err) {
          console.log(
            "Unable to upload file " +
            path
              .join(
                rootFolder,
                path.relative(
                  process.cwd(),
                  path.join(rootFolder.toString(), "metadata.json")
                )
              )
              .replace(/\\/g, "/")
          );
          console.log(err);
        }
      } else {
        console.log("Nothing to push");
      }
    } else {
      let metaData = JSON.parse(
        fs.readFileSync(path.join(".dorky", "metadata.json")).toString()
      );
      metaData["stage-1-files"].map(async (file) => {
        if (metaData["uploaded-files"].includes(file)) return;
        else {
          const putObjectParams = {
            Bucket: bucketName,
            Key: path
              .join(rootFolder, path.relative(process.cwd(), file))
              .replace(/\\/g, "/"),
            Body: fs
              .readFileSync(path.relative(process.cwd(), file))
              .toString(),
          };
          // Upload records
          try {
            const uploadResponse = await s3Client.send(
              new PutObjectCommand(putObjectParams)
            );
            if (uploadResponse) console.log(chalk.green("Uploaded " + file));
          } catch (err) {
            console.log(
              "Unable to upload file " +
              path
                .join(rootFolder, path.relative(process.cwd(), file))
                .replace(/\\/g, "/")
            );
            console.log(err);
          }
          metaData["uploaded-files"].push(file);
        }
      });
      metaData["uploaded-files"] = Array.from(
        new Set(metaData["uploaded-files"])
      );
      fs.writeFileSync(
        path.join(".dorky", "metadata.json"),
        JSON.stringify(metaData)
      );
      putObjectParams = {
        Bucket: bucketName,
        Key: path
          .relative(
            process.cwd(),
            path.join(rootFolder.toString(), "metadata.json")
          )
          .replace(/\\/g, "/"),
        Body: JSON.stringify(metaData),
      };
      // Upload metadata.json
      try {
        const uploadResponse = await s3Client.send(
          new PutObjectCommand(putObjectParams)
        );
        if (uploadResponse)
          console.log(
            chalk.green(
              "Uploaded " + path.join(rootFolder.toString(), "metadata.json")
            )
          );
      } catch (err) {
        console.log(
          "Unable to upload file " +
          path
            .join(rootFolder, path.relative(process.cwd(), file))
            .replace(/\\/g, "/")
        );
        console.log(err);
      }
    }
  }
  rootFolderExists(rootFolder);
}

async function pullChanges() {
  console.log("Pulling files from server.");
  let rootFolder;
  if (process.cwd().includes("\\")) {
    rootFolder = process.cwd().split("\\").pop();
  } else if (process.cwd().includes("/")) {
    rootFolder = process.cwd().split("/").pop();
  } else rootFolder = process.cwd();
  const bucketParams = { Bucket: bucketName };
  const getObjectsResponse = await s3Client.send(
    new ListObjectsCommand(bucketParams)
  );
  if (
    getObjectsResponse.Contents.filter(
      (object) => object.Key.split("/")[0] == rootFolder
    ).length > 0
  ) {
    if (
      getObjectsResponse.Contents.filter(
        (object) => object.Key == rootFolder + "/metadata.json"
      ).length > 0
    ) {
      const params = {
        Bucket: bucketName,
        Key: rootFolder + "/metadata.json",
      };
      s3Client.send(new GetObjectCommand(params), async (err, data) => {
        if (err) console.error(err);
        else {
          let metaData = JSON.parse(await data.Body.transformToString());
          // Pull metadata.json
          const METADATA_FILE = ".dorky/metadata.json";
          fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
          let pullFileParams;
          metaData["uploaded-files"].map((file) => {
            pullFileParams = {
              Bucket: bucketName,
              Key: rootFolder + "/" + file,
            };
            s3Client.send(
              new GetObjectCommand(pullFileParams),
              async (err, data) => {
                if (err) console.log(err);
                else {
                  console.log("Creating file " + file);
                  let fileData = await data.Body.transformToString();
                  let subDirectories;
                  if (process.cwd().includes("\\")) {
                    subDirectories = path
                      .relative(process.cwd(), file)
                      .split("\\");
                  } else if (process.cwd().includes("/")) {
                    subDirectories = path
                      .relative(process.cwd(), file)
                      .split("/");
                  } else subDirectories = path.relative(process.cwd(), file);
                  subDirectories.pop();
                  if (process.platform === "win32") {
                    subDirectories = subDirectories.join("\\");
                  } else if (
                    process.platform === "linux" ||
                    process.platform === "darwin"
                  ) {
                    subDirectories = subDirectories.join("/");
                  }
                  if (subDirectories.length)
                    fs.mkdirSync(subDirectories, { recursive: true });
                  fs.writeFileSync(
                    path.relative(process.cwd(), file),
                    fileData
                  );
                }
              }
            );
          });
        }
      });
    } else {
      console.log("Metadata doesn't exist");
    }
  } else {
    console.error(chalk.red("Failed to pull folder, as it doesn't exist"));
  }
}

if (
  process.env.BUCKET_NAME &&
  process.env.AWS_ACCESS_KEY &&
  process.env.AWS_SECRET_KEY &&
  process.env.AWS_REGION
) {
  bucketName = process.env.BUCKET_NAME;
  s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
    },
  });
  if (fs.existsSync(".dorky")) {
    const credentials = [
      `AWS_ACCESS_KEY=${process.env.AWS_ACCESS_KEY}`,
      `AWS_SECRET_KEY=${process.env.AWS_SECRET_KEY}`,
      `AWS_REGION=${process.env.AWS_REGION}`,
      `BUCKET_NAME=${process.env.BUCKET_NAME}`,
    ];
    fs.writeFileSync(".dorky/.credentials", credentials.join("\n"));
  }
} else {
  if (fs.existsSync(".dorky")) {
    if (fs.existsSync(".dorky/.credentials")) {
      const credentials = fs
        .readFileSync(".dorky/.credentials", "utf8")
        .toString()
        .split("\n");
      if (credentials.length < 4) {
        console.log(
          chalk.red(
            "Set BUCKET_NAME, AWS_ACCESS_KEY, AWS_SECRET_KEY and AWS_REGION first."
          )
        );
        exit();
      }
      const region = credentials
        .filter((credential) => credential.includes("AWS_REGION"))[0]
        .split("=")[1];
      const accessKey = credentials
        .filter((credential) => credential.includes("AWS_ACCESS_KEY"))[0]
        .split("=")[1];
      const secretKey = credentials
        .filter((credential) => credential.includes("AWS_SECRET_KEY"))[0]
        .split("=")[1];
      bucketName = credentials
        .filter((credential) => credential.includes("BUCKET_NAME"))[0]
        .split("=")[1];
      s3Client = new S3Client({
        region: region,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
      });
      console.log(chalk.blue("Set credentials from file."));
    } else {
      console.log(
        chalk.red(
          "Set BUCKET_NAME, AWS_ACCESS_KEY, AWS_SECRET_KEY and AWS_REGION first."
        )
      );
      exit();
    }
  } else {
    console.log(
      chalk.red(
        "Unable to find .dorky folder, please reinitialize the project in the root folder or set the BUCKET_NAME, AWS_ACCESS_KEY, AWS_SECRET_KEY and AWS_REGION in environment variables."
      )
    );
    exit();
  }
}

const args = process.argv.splice(2, 2);

if (args.length == 0) {
  const figlet = `
      __            __          
  .--|  .-----.----|  |--.--.--.
  |  _  |  _  |   _|    <|  |  |
  |_____|_____|__| |__|__|___  |
                         |_____| 
  `;
  console.log(figlet);
  const helpMessage = `Help message:\ninit\t Initializes a dorky project.\nlist\t Lists files in current root directory.\npush\t Pushes changes to S3 bucket.\npull\t Pulls changes from S3 bucket to local root folder.`;
  console.log(helpMessage);
} else if (args.length == 1) {
  if (args[0] == "init") initializeProject();
  if (args[0] == "list") listFiles();
  if (args[0] == "push") pushChanges();
  if (args[0] == "pull") pullChanges();
} else if (args.length == 2) {
  if (args[0] == "add") {
    const METADATA_FILE = ".dorky/metadata.json";
    const HASHES_FILE = ".dorky/.dorkyhash";
    const file = args[1];
    if (fs.existsSync(file)) {
      const hashes = {};
      fs.readFileSync(HASHES_FILE)
        .toString()
        .split("\n")
        .filter((hash) => hash)
        .map((hash) => {
          hashes[hash.split("=")[0]] = hash.split("=")[1];
        });
      if (Object.keys(hashes).includes(file)) {
        // File already staged
        const fileContent = fs.readFileSync(file).toString();
        const currentHash = createHash("md5")
          .update(fileContent)
          .digest("base64")
          .split("==")[0];
        const hashToCompare = hashes[file];
        if (currentHash == hashToCompare) {
          console.log(
            chalk.red(
              `File ${chalk.bgRed(
                chalk.white(file)
              )} hasn\'t been modified since last push.`
            )
          );
          return;
        } else {
          console.log(chalk.green(`Staging ${file} since has been modified.`));
          hashes[file] = currentHash;
          const updatedFileContent = Object.entries(hashes).map(
            (fileAndHash) => {
              return fileAndHash.join("=");
            }
          );
          fs.writeFileSync(HASHES_FILE, updatedFileContent.join("\n"));
          const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
          // Clear from uploaded files
          const uploadedFiles = new Set(metaData["uploaded-files"]);
          uploadedFiles.delete(file);
          metaData["uploaded-files"] = Array.from(uploadedFiles);
          fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
          console.log(
            `Updated ${chalk.bgGreen(
              chalk.white(file)
            )}, ready to push the updates from it.`
          );
        }
      } else {
        // New file
        const fileContent = fs.readFileSync(file).toString();
        hashes[file] = createHash("md5")
          .update(fileContent)
          .digest("base64")
          .split("==")[0];
        const updatedFileContent = Object.entries(hashes).map((fileAndHash) => {
          return fileAndHash.join("=");
        });
        fs.writeFileSync(HASHES_FILE, updatedFileContent.join("\n"));
        console.log(
          `Tracking updates from ${chalk.bgGreen(chalk.white(file))}`
        );
      }
      const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
      const stage1Files = new Set(metaData["stage-1-files"]);
      stage1Files.add(file);
      metaData["stage-1-files"] = Array.from(stage1Files);
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
      console.log(chalk.bgGreen("Success"));
      console.log(chalk.green(`Added file ${file} successfully to stage-1.`));
    } else {
      console.log(chalk.bgRed("Error"));
      console.log(chalk.red(`\tFile ${file} doesn\'t exist`));
    }
  } else if (args[0] == "reset") {
    const METADATA_FILE = ".dorky/metadata.json";
    const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
    const file = args[1];
    resetFileIndex = metaData["stage-1-files"].indexOf(file);
    metaData["stage-1-files"].splice(resetFileIndex, 1);
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
  }
}
