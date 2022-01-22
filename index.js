const glob = require("glob");

const exclusions = ['node_modules', 'tester'];

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
        console.log(listOfFiles);
    }
});