const async = require('async');

const files = require('utils/files');

const paths = require('app/resources/paths');

const handlerManager = require('app/handler-manager');

module.exports = function (done) {
    async.parallel({
        loginKey: function (callback) {
            files.readFile(paths.files.loginKey, callback);
        },
        pollData: function (callback) {
            files.readFile(paths.files.pollData, true, callback);
        },
        loginAttempts: function (callback) {
            files.readFile(paths.files.loginAttempts, true, callback);
        },
        pricelist: function (callback) {
            files.readFile(paths.files.pricelist, true, callback);
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

        if (data.pricelist !== null) {
            handler.setPricelist(data.pricelist);
        }

        done({ loginKey: data.loginKey });
    });
};
