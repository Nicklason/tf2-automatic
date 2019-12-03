require('module-alias/register');

const dotenv = require('dotenv');
dotenv.config();

const EconItem = require('steam-tradeoffer-manager/lib/classes/EconItem.js');
const CEconItem = require('steamcommunity/classes/CEconItem.js');

['hasDescription', 'getAction', 'getTag', 'getItem', 'getSKU', 'getName'].forEach(function (v) {
    const func = require('utils/item/' + v);
    EconItem.prototype[v] = func;
    CEconItem.prototype[v] = func;
});

const SteamUser = require('steam-user');
const async = require('async');

const client = require('lib/client');
const manager = require('lib/manager');

const schemaManager = require('lib/tf2-schema');
const listingManager = require('lib/bptf-listings');

/* eslint-disable-next-line no-unused-vars */
const tf2 = require('lib/tf2');

const handlerManager = require('app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

require('death')({ uncaughtException: true })(function (signal, err) {
    handler.shutdown(typeof err === 'string' ? null : err);
});

handler.onRun(function (opts) {
    opts = opts || {};

    const loginKey = opts.loginKey || null;

    let lastLoginFailed = false;

    const login = require('app/login');

    // Perform login
    login(loginKey, loginResponse);

    function loginResponse (err) {
        if (err) {
            if (!lastLoginFailed && err.eresult !== SteamUser.EFriendRelationship.RateLimitExceeded && err.eresult !== SteamUser.EFriendRelationship.InvalidPassword) {
                lastLoginFailed = true;
                // Try and sign in without login key
                login(null, loginResponse);
            } else {
                handler.onLoginFailure(err);
            }
            return;
        }

        handler.onLoginSuccessful();

        // TODO: Detect when steam is down using the limitations callback function

        require('utils/limitationsCallback')(function (err, limitations) {
            if (err) {
                throw err;
            }

            if (limitations.limited) {
                throw new Error('The account is limited');
            } else if (limitations.communityBanned) {
                throw new Error('The account is community banned');
            } else if (limitations.locked) {
                throw new Error('The account is locked');
            }

            schemaManager.init(function (err) {
                if (err) {
                    throw err;
                }

                // Set schema for bptf-listings
                listingManager.schema = schemaManager.schema;

                // Set steamid
                listingManager.steamid = client.steamID;
                manager.steamID = client.steamID;

                async.parallel({
                    inventory: function (callback) {
                        // Load inventory
                        require('app/inventory').getInventory(client.steamID, callback);
                    },
                    listings: function (callback) {
                        // Initialize bptf-listings
                        listingManager.init(callback);
                    },
                    cookies: function (callback) {
                        // Wait for steamcommunity session
                        require('utils/communityLoginCallback')(false, callback);
                    }
                }, function (err, result) {
                    if (err) {
                        throw err;
                    }

                    // Set cookies for the tradeoffer manager which will start the polling
                    manager.setCookies(result.cookies, function (err) {
                        if (err) {
                            throw err;
                        }

                        handler.onReady();
                    });
                });
            });
        });
    }
});
