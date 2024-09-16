const fs = require("fs");
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
// const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFileSync(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFileSync(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFileSync(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFilesSync(authClient) {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
    });
    const files = res.data.files;
    return files;
}

authorize().then(async (authClient) => {
    // Start from here => 
    // const file = {
    //     name: "some-file.txt",
    //     path: path.join(process.cwd(), "some-file.txt"),
    //     mimeType: "text/plain"
    // }
    // const addedFile = await addFileToGoogleDrive(authClient, file);
    // console.log("Added file to Google Drive", addedFile);
    console.log("Files in Google Drive:");
    const files = await listFilesSync(authClient);
    console.log(files);
    // files.forEach(async (file) => {
    //     if (file.name === "some-file.txt") {
    //         console.log("Downloaded file", await downloadFileFromGoogleDrive(authClient, { fileId: file.id, path: path.join(process.cwd(), file.name) }));
    //         setTimeout(async () => {
    //             console.log("Deleted file: ", await deleteFileFromGoogleDrive(authClient, { fileId: file.id }), file.name);
    //         }, 60000);
    //     }
    // });

}).catch(console.error);

async function addFileToGoogleDrive(authClient, file) {
    console.log("Adding files to Google Drive");
    const drive = google.drive({ version: 'v3', auth: authClient });
    const requestBody = {
        name: file.name,
        fields: 'id',
    };
    const media = {
        mimeType: file.mimeType,
        body: fs.createReadStream(file.path),
    };
    try {
        const _file = await drive.files.create({
            requestBody,
            media: media,
        });
        console.log('File Id:', _file.data.id);
        return _file.data.id;
    } catch (err) {
        // TODO(developer) - Handle error
        throw err;
    }
}

async function downloadFileFromGoogleDrive(authClient, file) {
    const drive = google.drive({ version: "v3", auth: authClient });
    try {
        const _file = await drive.files.get({ fileId: file.fileId, alt: "media" });
        fs.writeFileSync(file.path, _file.data.toString("utf-8"), "utf-8");
        return _file.status === 200;
    } catch (err) {
        throw err;
    }

}

async function deleteFileFromGoogleDrive(authClient, file) {
    const drive = google.drive({ version: "v3", auth: authClient });
    try {
        const _file = await drive.files.delete({ fileId: file.fileId });
        return _file.status === 204;
    } catch (err) {
        throw err;
    }
}