const async = require('async');

const log = require('lib/logger');
const bptfLogin = require('lib/bptf-login');

const handlerManager = require('app/handler-manager');

module.exports = function (callback) {
    if (process.env.BPTF_API_KEY && process.env.BPTF_ACCESS_TOKEN) {
        callback(null, {
            apiKey: process.env.BPTF_API_KEY,
            accessToken: process.env.BPTF_ACCESS_TOKEN
        });
        return;
    }

    log.warn('You have not included the backpack.tf API key or access token in the config - signing in to backpack.tf...');

    // Sign in to backpack.tf
    bptfLogin.login(function (err) {
        if (err) {
            return callback(err);
        }

        log.verbose('Logged in to backpack.tf!');

        log.verbose('Getting API key and access token...');

        // Get api key and token

        async.parallel({
            apiKey: function (callback) {
                getAPIKey(callback);
            },
            accessToken: function (callback) {
                bptfLogin.getAccessToken(callback);
            }
        }, function (err, result) {
            if (err) {
                return callback(err);
            }

            log.verbose('Got backpack.tf API key and access token!');

            process.env.BPTF_ACCESS_TOKEN = result.accessToken;
            process.env.BPTF_API_KEY = result.apiKey;

            handlerManager.getHandler().onBptfAuth(result);

            return callback(null, result);
        });
    });
};

function getAPIKey (callback) {
    bptfLogin.getAPIKey(function (err, apiKey) {
        if (err) {
            return callback(err);
        }

        if (apiKey !== null) {
            return callback(null, apiKey);
        }

        log.verbose('You don\'t have a backpack.tf API key, generating one...');

        bptfLogin.generateAPIKey('http://localhost', 'Check if an account is banned on backpack.tf', callback);
    });
}
