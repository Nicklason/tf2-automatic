const fs = require('fs');

if (!fs.existsSync('../node_modules')) {
    /* eslint-disable-next-line no-console */
    console.error('Missing dependencies! Install them with `npm install`');
    process.exit(1);
}

const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const log = require('./lib/logger');

if (process.env.pm_id === undefined) {
    log.warn('You are not running the bot with PM2! If the bot crashes it won\'t start again, see the documentation: https://github.com/Nicklason/tf2-automatic/wiki/PM2');
}

const handlerManager = require('./app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

const EconItem = require('steam-tradeoffer-manager/lib/classes/EconItem.js');
const CEconItem = require('steamcommunity/classes/CEconItem.js');

['hasDescription', 'getAction', 'getTag', 'getItem', 'getSKU', 'getName', 'getPrice'].forEach(function (v) {
    const func = require('./app/utils/item/' + v);
    EconItem.prototype[v] = func;
    CEconItem.prototype[v] = func;
});

const TradeOffer = require('steam-tradeoffer-manager/lib/classes/TradeOffer');

['log', 'summarize'].forEach(function (v) {
    TradeOffer.prototype[v] = require('./app/utils/offer/' + v);
});

const pjson = require('pjson');

require('death')({ uncaughtException: true })(function (signal, err) {
    const crashed = typeof err !== 'string';

    if (crashed) {
        if (err.statusCode >= 500 || err.statusCode === 429) {
            delete err.body;
        }

        log.error([
            pjson.name + (!handler.isReady() ? ' failed to start properly, this is most likely a temporary error. See the log:' : ' crashed! Please create an issue with the following log:'),
            `package.version: ${pjson.version || undefined}; node: ${process.version} ${process.platform} ${process.arch}}`,
            'Stack trace:',
            require('util').inspect(err)
        ].join('\r\n'));

        if (handler.isReady()) {
            log.error('Create an issue here: https://github.com/Nicklason/tf2-automatic/issues/new?template=bug_report.md');
        }
    }

    if (!crashed) {
        log.warn('Received kill signal `' + signal + '`');
    }

    handler.shutdown(crashed ? err : null, true, signal === 'SIGKILL');
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
require('./lib/tf2');

const pm2 = require('pm2');

const client = require('./lib/client');
const manager = require('./lib/manager');
const community = require('./lib/community');

const schemaManager = require('./lib/tf2-schema');
const listingManager = require('./lib/bptf-listings');

log.info(pjson.name + ' v' + pjson.version + ' is starting...');

start();

function start () {
    let opts;
    let cookies;

    log.debug('Going through startup process...');

    async.eachSeries([
        function (callback) {
            log.debug('Connecting to PM2');

            // Connect to PM2
            pm2.connect(callback);
        },
        function (callback) {
            log.debug('Calling onRun');

            // Run handler onRun function
            handler.onRun(function (v) {
                // Set options
                opts = v;
                callback(null);
            });
        },
        function (callback) {
            log.info('Setting up pricelist...');

            // Set up pricelist
            require('./app/prices').init(callback);
        },
        function (callback) {
            // Sign in to Steam
            log.info('Signing in to Steam...');

            const login = require('./app/login');

            const loginKey = opts.loginKey || null;
            let lastLoginFailed = false;

            // Perform login
            login(loginKey, loginResponse);

            function loginResponse (err) {
                if (err) {
                    if (!lastLoginFailed && err.eresult !== SteamUser.EFriendRelationship.RateLimitExceeded && err.eresult !== SteamUser.EFriendRelationship.InvalidPassword) {
                        lastLoginFailed = true;
                        // Try and sign in without login key
                        log.warn('Failed to sign in to Steam, retrying without login key...');
                        return login(null, loginResponse);
                    } else {
                        log.warn('Failed to sign in to Steam: ', err);
                        return callback(err);
                    }
                }

                return callback(null);
            }
        },
        function (callback) {
            // Check account limitations
            if (process.env.SKIP_ACCOUNT_LIMITATIONS === 'true') {
                return callback(null);
            }

            log.verbose('Checking account limitations...');

            require('./app/utils/limitationsCallback')(function (err, limitations) {
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
        },
        function (callback) {
            // Wait for web session
            log.debug('Waiting for web session...');

            // Wait for steamcommunity session
            require('./app/utils/communityLoginCallback')(false, function (err, v) {
                if (err) {
                    return callback(err);
                }

                cookies = v;

                return callback(null);
            });
        },
        function (callback) {
            // Sign in to backpack.tf if needed
            require('./lib/bptf-login').setCookies(cookies);

            require('./app/bptf').setup(callback);
        },
        function (callback) {
            // Set up tf2-schema
            log.info('Initializing tf2-schema...');

            schemaManager.init(function (err) {
                if (err) {
                    return callback(err);
                }

                log.info('tf2-schema is ready!');

                return callback(null);
            });
        },
        function (callback) {
            // Get inventory, set up bptf-listings, update profile settings

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
                    require('./app/inventory').getInventory(client.steamID, callback);
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
            }, callback);
        },
        function (callback) {
            // Create listings
            log.info('Creating listings...');

            require('./app/handler/listings').redoListings(callback);
        },
        function (callback) {
            // Set up trade offer manager

            // Connect to socketio server after creating listings
            require('./lib/ptf-socket').open();

            log.info('Getting Steam API key...');

            // Set cookies for the tradeoffer manager which will start the polling
            manager.setCookies(cookies, callback);
        },
        function (callback) {
            // Get friends limit
            require('./app/handler/friends').getMaxFriends(callback);
        }
    ], function (item, callback) {
        // Check if we are trying to shut down
        if (handlerManager.shutdownRequested()) {
            log.warn('Shutdown requested during startup process, stopping now...');
            // Stop the bot
            handlerManager.getHandler().shutdown(null, false, false);
            return;
        }

        // Call function
        item(callback);
    }, function (err) {
        if (err) {
            throw err;
        }

        handlerManager.setReady();

        handler.onReady();

        // Start version checker
        require('./app/version-check').startVersionChecker();
    });
}
