const request = require('@nicklason/request-retry');
const semver = require('semver');
const log = require('lib/logger');

const package = require('@root/package.json');

// Maybe save latest notified version to a file?
let lastNotifiedVersion = package.version;

exports.getLatestVersion = function (callback) {
    request({
        method: 'GET',
        url: 'https://raw.githubusercontent.com/Nicklason/tf2-automatic/master/package.json',
        json: true
    }, function (err, response, body) {
        if (err) {
            return callback(err);
        }

        return callback(null, body.version);
    });
};

function checkForUpdate () {
    exports.getLatestVersion(function (err, latestVersion) {
        if (err) {
            log.warn('Failed to check for updates: ' + err);
            return;
        }

        if (lastNotifiedVersion !== latestVersion && semver.lt(package.version, latestVersion)) {
            lastNotifiedVersion = latestVersion;
            require('app/admins').message(`Update available! Current: v${package.version}, Latest: v${latestVersion}.\nSee the wiki for help: https://github.com/Nicklason/tf2-automatic/wiki/Updating`);
        }
    });
}

checkForUpdate();

// Check for updates every 60 minutes
setInterval(checkForUpdate, 1 * 60 * 60 * 1000);
