import async from 'async';

import * as files from '../utils/files';

import paths from '../resources/paths';

import * as handlerManager from '../handler-manager';

export default function (done) {
    async.parallel({
        loginKey: function (callback) {
            files.readFile(paths.files.loginKey, false, callback);
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
