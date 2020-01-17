try {
    require('module-alias/register');
} catch (err) {
    /* eslint-disable-next-line no-console */
    console.error('Missing dependencies! Install them with `npm install`');
    process.exit(1);
}

const dotenv = require('dotenv');
dotenv.config();

const log = require('lib/logger');

if (process.env.pm_id === undefined) {
    log.warn('You are not running the bot with PM2! If the bot crashes it won\'t start again, see the documentation: https://github.com/Nicklason/tf2-automatic/wiki/PM2');
}

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

const TradeOffer = require('steam-tradeoffer-manager/lib/classes/TradeOffer');

['log', 'summarize'].forEach(function (v) {
    TradeOffer.prototype[v] = require('utils/offer/' + v);
});

const package = require('@root/package.json');

require('death')({ uncaughtException: true })(function (signal, err) {
    const crashed = typeof err !== 'string';

    if (crashed) {
        if (err.statusCode >= 500 || err.statusCode === 429) {
            delete err.body;
        }

        log.error([
            package.name + (!handler.isReady() ? ' failed to start properly, this is most likely a temporary error. See the log:' : ' crashed! Please create an issue with the following log:'),
            `package.version: ${package.version || undefined}; node: ${process.version} ${process.platform} ${process.arch}}`,
            'Stack trace:',
            require('util').inspect(err)
        ].join('\r\n'));

        if (handler.isReady()) {
            log.error('Create an issue here: https://github.com/Nicklason/tf2-automatic/issues/new?template=bug_report.md');
        }
    }

    if (!crashed) {
        log.warn('Received kill signal `' + signal + '`, stopping...');
    }

    handler.shutdown(crashed ? err : null, signal === 'SIGKILL');
});

process.on('message', function (message) {
    if (message === 'shutdown') {
        // For using PM2 on Windows
        log.warn('Process received shutdown message, stopping...');

        handler.shutdown(null);
    } else {
        log.warn('Process received unknown message `' + message + '`');
    }
});

const SteamUser = require('steam-user');
const async = require('async');

// Set up node-tf2
require('lib/tf2');

const pm2 = require('pm2');

const client = require('lib/client');
const manager = require('lib/manager');
const community = require('lib/community');

const schemaManager = require('lib/tf2-schema');
const listingManager = require('lib/bptf-listings');

log.info(package.name + ' v' + package.version + ' is starting...');

pm2.connect(function (err) {
    if (err) {
        throw err;
    }

    handler.onRun(function (opts) {
        opts = opts || {};

        log.info('Setting up pricelist...');

        // Set up pricelist before signing in to Steam, this is because if the bot has a big pricelist then it will be blocking the event loop

        // TODO: Don't block event loop when setting up pricelist
        require('app/prices').init(function (err) {
            if (err) {
                throw err;
            }

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

                checkAccountLimitations(function (err) {
                    if (err) {
                        throw err;
                    }

                    log.debug('Waiting for web session...');

                    // Wait for steamcommunity session
                    require('utils/communityLoginCallback')(false, function (err, cookies) {
                        if (err) {
                            throw err;
                        }

                        require('lib/bptf-login').setCookies(cookies);

                        require('app/bptf').setup(function (err) {
                            if (err) {
                                throw err;
                            }
                            log.info('Initializing tf2-schema...');

                            schemaManager.init(function (err) {
                                if (err) {
                                    throw err;
                                }

                                log.info('tf2-schema is ready!');

                                // Set access token
                                listingManager.token = process.env.BPTF_ACCESS_TOKEN;
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
                                    profile: function (callback) {
                                        // Updating profile and inventory to be public
                                        if (process.env.SKIP_UPDATE_PROFILE_SETTINGS === 'true') {
                                            return callback(null);
                                        }

                                        community.profileSettings({
                                            profile: 3,
                                            inventory: 3,
                                            inventoryGifts: false
                                        }, callback);
                                    }
                                }, function (err, result) {
                                    if (err) {
                                        throw err;
                                    }

                                    log.info('Creating listings...');

                                    require('handler/listings').checkAll(function (err) {
                                        if (err) {
                                            throw err;
                                        }

                                        // Connect to socketio server after creating listings
                                        require('lib/ptf-socket').open();

                                        log.info('Getting Steam API key...');

                                        // Set cookies for the tradeoffer manager which will start the polling
                                        manager.setCookies(cookies, function (err) {
                                            if (err) {
                                                throw err;
                                            }

                                            require('handler/friends').getMaxFriends(function (err) {
                                                if (err) {
                                                    throw err;
                                                }

                                                handlerManager.setReady();

                                                handler.onReady();

                                                // Start version checker
                                                require('app/version-check');
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            }
        });
    });
});

function checkAccountLimitations (callback) {
    if (process.env.SKIP_ACCOUNT_LIMITATIONS === 'true') {
        return callback(null);
    }

    log.verbose('Checking account limitations...');

    require('utils/limitationsCallback')(function (err, limitations) {
        if (err) {
            return callback(err);
        }

        if (limitations.limited) {
            return callback(new Error('The account is limited'));
        } else if (limitations.communityBanned) {
            return callback(new Error('The account is community banned'));
        } else if (limitations.locked) {
            return callback(new Error('The account is locked'));
        }

        log.verbose('Account limitation checks completed!');

        return callback(null);
    });
}
