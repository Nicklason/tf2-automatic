const async = require('async');

const log = require('lib/logger');
const bptfLogin = require('lib/bptf-login');
const community = require('lib/community');

const handlerManager = require('app/handler-manager');

let hasLoggedIn = false;

exports.setup = function (callback) {
    async.series([
        function (callback) {
            getAPICredentials(callback);
        },
        function (callback) {
            setTradeOfferUrl(callback);
        }
    ], callback);
};

function getAPICredentials (callback) {
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

        bptfLogin.loggedIn = true;

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
}

function setTradeOfferUrl (callback) {
    if (process.env.SKIP_BPTF_TRADEOFFERURL === 'true') {
        callback(null);
        return;
    }

    log.info('Updating trade offer url on backpack.tf...');

    login(function (err) {
        if (err) {
            return callback(err);
        }

        async.parallel({
            settings: function (callback) {
                bptfLogin.getSettings(callback);
            },
            tradeofferurl: function (callback) {
                community.getTradeURL(callback);
            }
        }, function (err, result) {
            if (err) {
                return callback(err);
            }

            const settings = result.settings;
            settings.tradeoffers_url = result.tradeofferurl[0];

            bptfLogin.updateSettings(settings, function (err, newSettings) {
                if (err) {
                    return callback(err);
                }

                log.warn('Updated trade offer url on backpack.tf (' + newSettings.tradeoffers_url + ') - please disable this in the config (SKIP_BPTF_TRADEOFFERURL=false)');

                return callback(null);
            });
        });
    });
}

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

function login (callback) {
    if (hasLoggedIn) {
        callback(null);
        return;
    }

    log.verbose('Signing in to backpack.tf...');

    bptfLogin.login(function (err) {
        if (err) {
            return callback(err);
        }

        log.verbose('Logged in to backpack.tf!');

        hasLoggedIn = true;
        return callback(null);
    });
}
