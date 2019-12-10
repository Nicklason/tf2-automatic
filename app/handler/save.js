const log = require('lib/logger');
const files = require('utils/files');

const paths = require('resources/paths');

exports.onLoginKey = function (loginKey) {
    files.writeFile(paths.loginKey, loginKey, function (err) {
        if (err) {
            log.warn('Error saving login key', { error: err });
        }
    });
};

exports.onLoginAttempts = function (attempts) {
    files.writeFile(paths.loginAttempts, attempts, true, function (err) {
        if (err) {
            log.warn('Error saving login attempts', { error: err });
        }
    });
};

exports.onPollData = function (pollData) {
    files.writeFile(paths.pollData, pollData, true, function (err) {
        if (err) {
            log.warn('Error saving poll data', { error: err });
        }
    });
};
