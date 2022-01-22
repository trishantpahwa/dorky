const glob = require('glob');
const chalk = require('chalk');

const exclusions = ['node_modules', 'tester'];

function listFiles() {
    var getDirectories = function (src, callback) {
        glob(src + '/**/*', callback);
    };

    function excludeIsPresent(element) {
        let present = false;
        let i = 0;
        while(i<exclusions.length) {
            if(element.includes(exclusions[i])) present = true;
            i += 1;
        }
        return present;
    }

    getDirectories(__dirname, function (err, res) {
        if (err) {
            console.log('Error', err);
        } else {
            let listOfFiles;
            listOfFiles = res.filter(element => !excludeIsPresent(element));
            console.log(chalk.green('Found files:'))
            listOfFiles.map((file) => console.log('\t' + chalk.bgGrey(file)));
        }
    });
}

const args = process.argv.splice(2, 2);
if(args.length == 1) {
    if(args[0] == 'list') {
        listFiles();
    }
}