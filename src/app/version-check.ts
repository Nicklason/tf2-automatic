import request from '@nicklason/request-retry';
import semver from 'semver';
import log from '../lib/logger';

import pjson from 'pjson';

// Maybe save latest notified version to a file?
let lastNotifiedVersion = pjson.version;

export function getLatestVersion (callback) {
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

export function checkForUpdates (callback = undefined) {
    if (!callback) {
        callback = noop;
    }

    getLatestVersion(function (err, latestVersion) {
        if (err) {
            log.warn('Failed to check for updates: ', err);
            callback(err);
            return;
        }

        const hasNewVersion = semver.lt(pjson.version, latestVersion);

        if (lastNotifiedVersion !== latestVersion && hasNewVersion) {
            lastNotifiedVersion = latestVersion;
            require('./admins').message(`Update available! Current: v${pjson.version}, Latest: v${latestVersion}.\nSee the wiki for help: https://github.com/Nicklason/tf2-automatic/wiki/Updating`);
        }

        callback(null, hasNewVersion, lastNotifiedVersion, latestVersion);
    });
};

export function startVersionChecker () {
    checkForUpdates();

    // Check for updates every 10 minutes
    setInterval(checkForUpdates, 10 * 60 * 1000);
};

function noop () {}
