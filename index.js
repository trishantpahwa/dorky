#!/usr/bin/env node

const glob = require('glob');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const { EOL } = require('os');


// Initializes project, creates a new .dorky folder, and adds a metadata file to it, and creates a .dorkyignore file.
function initializeProject() {
    if (fs.existsSync('.dorky')) {
        console.log('Dorky project already initialized. Remove .dorky folder to reinitialize.')
    } else {
        fs.mkdirSync('.dorky');
        fs.writeFileSync('.dorky/metadata.json', JSON.stringify({'stage-1-files': [], 'uploaded-files': []}));
        if (fs.existsSync('.dorkyignore')) {
            fs.rmdirSync('.dorky');
            console.log('Dorky project already initialized. Remove .dorkyignore file to reinitialize.');
        } else {
            fs.writeFileSync('.dorkyignore', '');
            console.log('Initialized project in current folder(.dorky).');
        }
    }
}

// Lists all the files that are not excluded explicitly.
function listFiles() {
    let exclusions = fs.readFileSync('./.dorkyignore').toString().split(EOL);
    if(exclusions[0] == '') exclusions = [];
    var getDirectories = function (src, callback) {
        glob(src + '/**/*', callback);
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

    getDirectories(__dirname, function (err, res) {
        if (err) {
            console.log('Error', err);
        } else {
            let listOfFiles;
            listOfFiles = res.filter(element => !excludeIsPresent(element)).map(file => path.relative(__dirname, file));
            console.log(chalk.green('Found files:'))
            listOfFiles.map((file) => console.log('\t' + chalk.bgGrey(file)));
        }
    });
}

const args = process.argv.splice(2, 2);
if (args.length == 1) {
    if (args[0] == 'init') {
        initializeProject();
    }
    if (args[0] == 'list') {
        listFiles();
    }
} else if (args.length == 2) {
    if (args[0] == 'add') {
        const METADATA_FILE = '.dorky/metadata.json';
        const file = args[1];
        if(fs.existsSync(file)) {
            const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
            const metaDataFiles = new Set(metaData['stage-1-files']);
            metaDataFiles.add(file);
            metaData['stage-1-files'] = Array.from(metaDataFiles);
            fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
            console.log(chalk.bgGreen('Success'));
            console.log(chalk.green(`Added file ${file} successfully to stage-1.`))
        } else {
            console.log(chalk.bgRed('Error'))
            console.log(chalk.red(`\tFile ${file} doesn\'t exist`))
        }
    }
}