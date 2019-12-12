const async = require('async');

const files = require('utils/files');

const paths = require('app/resources/paths');

const handlerManager = require('app/handler-manager');

module.exports = function (done) {
    async.parallel({
        loginKey: function (callback) {
            files.readFile(paths.loginKey, callback);
        },
        pollData: function (callback) {
            files.readFile(paths.pollData, true, callback);
        },
        loginAttempts: function (callback) {
            files.readFile(paths.loginAttempts, true, callback);
        },
        actions: function (callback) {
            files.readFile(paths.actions, true, callback);
        }
    }, function (err, data) {
        if (err) {
            throw err;
        }

        const handler = handlerManager.getHandler();

        if (data.pollData !== null) {
            handler.setPollData(data.pollData);
        }

        if (data.loginAttempts !== null) {
            handler.setLoginAttempts(data.loginAttempts);
        }

        if (data.actions !== null) {
            handler.setActions(data.actions);
        }

        done({ loginKey: data.loginKey });
    });
};
