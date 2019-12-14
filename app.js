require('module-alias/register');

const dotenv = require('dotenv');
dotenv.config();

const handlerManager = require('app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

const EconItem = require('steam-tradeoffer-manager/lib/classes/EconItem.js');
const CEconItem = require('steamcommunity/classes/CEconItem.js');

['hasDescription', 'getAction', 'getTag', 'getItem', 'getSKU', 'getName', 'getPrice'].forEach(function (v) {
    const func = require('utils/item/' + v);
    EconItem.prototype[v] = func;
    CEconItem.prototype[v] = func;
});

const log = require('lib/logger');

const package = require('@root/package.json');

require('death')({ uncaughtException: true })(function (signal, err) {
    const crashed = typeof err !== 'string';

    if (crashed) {
        log.error([
            package.name + ' crashed! If you think this is a problem with the framework (and not your code), then please create an issue with the following log:',
            `package.version: ${package.version || undefined}; node: ${process.version} ${process.platform} ${process.arch}}`,
            'Stack trace:',
            require('util').inspect(err)
        ].join('\r\n'));

        log.error('Create an issue here: https://github.com/Nicklason/bot-framework/issues/new');
    } else {
        log.warn('Received kill signal `' + signal + '`, stopping...');
    }

    // Check if it is an error (error object) or a signal (string)
    handler.shutdown(crashed ? err : null);
});

const SteamUser = require('steam-user');
const async = require('async');

// Set up node-tf2
require('lib/tf2');

const client = require('lib/client');
const manager = require('lib/manager');

const schemaManager = require('lib/tf2-schema');
const listingManager = require('lib/bptf-listings');

log.info(package.name + ' v' + package.version + ' is starting...');

handler.onRun(function (opts) {
    opts = opts || {};

    const loginKey = opts.loginKey || null;

    let lastLoginFailed = false;

    const login = require('app/login');

    log.info('Signing in to Steam...');

    // Perform login
    login(loginKey, loginResponse);

    function loginResponse (err) {
        if (err) {
            if (!lastLoginFailed && err.eresult !== SteamUser.EFriendRelationship.RateLimitExceeded && err.eresult !== SteamUser.EFriendRelationship.InvalidPassword) {
                lastLoginFailed = true;
                // Try and sign in without login key
                log.warn('Failed to sign in to Steam, retrying without login key...');
                login(null, loginResponse);
            } else {
                log.warn('Failed to sign in to Steam');
                handler.onLoginFailure(err);
            }
            return;
        }

        log.info('Signed in to Steam!');

        handler.onLoginSuccessful();

        // TODO: Detect when steam is down using the limitations callback function

        log.verbose('Checking account limitations...');

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

            log.verbose('Account limitation checks completed!');

            log.info('Initializing tf2-schema...');

            schemaManager.init(function (err) {
                if (err) {
                    throw err;
                }

                log.info('tf2-schema is ready!');

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

                    log.debug('Setting up pricelist...');

                    require('app/prices').init(function (err) {
                        if (err) {
                            throw err;
                        }

                        log.verbose('Getting API key...');

                        // Set cookies for the tradeoffer manager which will start the polling
                        manager.setCookies(result.cookies, function (err) {
                            if (err) {
                                throw err;
                            }

                            log.info(package.name + ' v' + package.version + ' is ready!');

                            handlerManager.setReady();

                            handler.onReady();
                        });
                    });
                });
            });
        });
    }
});
