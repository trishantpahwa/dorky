const glob = require("glob");

var getDirectories = function (src, callback) {
  glob(src + '/**/*', callback);
};
getDirectories(__dirname, function (err, res) {
  if (err) {
    console.log('Error', err);
  } else {
    console.log(res);
  }
});