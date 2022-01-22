#!/usr/bin/env node

const glob = require('glob');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const { EOL } = require('os');

function initializeProject() {
    if (fs.existsSync('.dorky')) {
        console.log('Dorky project already initialized. Remove .dorky folder to reinitialize.')
    } else {
        fs.mkdirSync('.dorky');
        if (fs.existsSync('.dorkyignore')) {
            fs.rmdirSync('.dorky');
            console.log('Dorky project already initialized. Remove .dorkyignore file to reinitialize.');
        } else {
            fs.writeFileSync('.dorkyignore', '');
            console.log('Initialized project in current folder(.dorky).');
        }
    }
}

function listFiles() {
    const exclusions = fs.readFileSync('./.dorkyignore').toString().split(EOL);
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
}