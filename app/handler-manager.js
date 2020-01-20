const SteamUser = require('steam-user');
const path = require('path');
const isPathInside = require('is-path-inside');
const pm2 = require('pm2');

const log = require('../lib/logger');
const files = require('./utils/files');
const backoff = require('./utils/exponentialBackoff');

const REQUIRED_OPTS = ['STEAM_ACCOUNT_NAME', 'STEAM_PASSWORD', 'STEAM_SHARED_SECRET', 'STEAM_IDENTITY_SECRET'];
const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginKey', 'onNewTradeOffer', 'onLoginAttempts', 'onPollData', 'onPricelist'];
const OPTIONAL_EVENTS = ['onMessage', 'onFriendRelationship', 'onGroupRelationship', 'onPriceChange', 'onTradeOfferChanged', 'onTradeFetchError', 'onConfirmationAccepted', 'onConfirmationError', 'onLogin', 'onLoginThrottle', 'onInventoryUpdated', 'onCraftingCompleted', 'onUseCompleted', 'onDeleteCompleted', 'onTF2QueueCompleted', 'onQueue', 'onBptfAuth', 'onSchema', 'onHeartbeat', 'onListings'];
const EXPORTED_FUNCTIONS = {
    restart: function (callback) {
        if (process.env.pm_id === undefined) {
            callback(null, false);
            return;
        }

        // TODO: Make restart function take arguments, for example, an option to update the environment variables

        log.warn('Restart has been initialized, restarting...');

        pm2.restart(process.env.pm_id, {}, function (err) {
            if (err) {
                return callback(err);
            }

            return callback(null, true);
        });
    },
    stop: function (callback) {
        if (process.env.pm_id === undefined) {
            EXPORTED_FUNCTIONS.shutdown();
            callback(null);
            return;
        }

        log.warn('Stop has been initialized, stopping...');

        pm2.stop(process.env.pm_id, function (err) {
            if (err) {
                return callback(err);
            }

            return callback(null);
        });
    },
    shutdown: function (err=null, checkIfReady=true, rudely=false) {
        log.debug('Shutdown has been initialized, stopping...', { err: err });

        shutdownRequested = true;
        shutdownCount++;

        if (shutdownCount >= 10) {
            rudely = true;
        }

        if (rudely) {
            log.warn('Forcefully exiting');
            stop();
            return;
        }

        if (err === null && checkIfReady && !EXPORTED_FUNCTIONS.isReady()) {
            return false;
        }

        if (shutdownCount > 1 && shuttingDown) {
            return false;
        }

        shuttingDown = true;

        this.cleanup();

        // TODO: Check if a poll is being made before stopping the bot

        handler.onShutdown(err, function () {
            log.debug('Shutdown callback has been called, cleaning up');

            stop();
        });

        function stop () {
            if (exiting) {
                return;
            }

            exiting = true;

            require('../lib/manager').shutdown();
            require('../lib/bptf-listings').shutdown();
            require('../lib/client').logOff();

            checkFiles(function () {
                // Listen for logger to finish
                log.on('finish', function () {
                    process.exit(err ? 1 : 0);
                });

                log.warn('Exiting...');

                // Stop the logger
                log.end();
            });
        }
    },
    cleanup: function () {
        log.debug('Cleaning up');

        // This will disable the reciving of messages and other friend related events
        isReady = false;

        // Make the bot snooze on Steam, that way people will know it is not running
        require('../lib/client').setPersona(SteamUser.EPersonaState.Snooze);

        // Disable login
        require('../lib/client').autoRelogin = false;

        // Stop price updates
        require('../lib/ptf-socket').disconnect();

        // Stop the polling of trade offers
        require('../lib/manager').pollInterval = -1;

        // Stop heartbeat and inventory timers
        clearInterval(require('../lib/bptf-listings')._heartbeatInterval);
        clearInterval(require('../lib/bptf-listings')._inventoryInterval);
    },
    setLoginAttempts (attempts) {
        require('./login-attempts').setAttempts(attempts);
    },
    setPollData: function (pollData) {
        require('./trade').setPollData(pollData);
    },
    setPricelist: function (pricelist) {
        require('./prices').setPricelist(pricelist);
    },
    acceptOffer (offer, callback) {
        require('./trade').acceptOffer(offer, callback);
    },
    declineOffer (offer, callback) {
        require('./trade').declineOffer(offer, callback);
    },
    sendOffer (offer, callback) {
        require('./trade').sendOffer(offer, callback);
    },
    cancelOffer (offer, callback) {
        require('./trade').cancelOffer(offer, callback);
    },
    getInventory (steamid, callback) {
        require('./inventory').getInventory(steamid, callback);
    },
    getOwnInventory () {
        return require('./inventory').getOwnInventory();
    },
    smeltMetal (defindex, amount) {
        require('./crafting').smeltMetal(defindex, amount);
    },
    combineMetal (defindex, amount) {
        require('./crafting').combineMetal(defindex, amount);
    },
    useItem (assetid) {
        require('./crafting').useItem(assetid);
    },
    isReady () {
        return exports.isReady();
    },
    isShuttingDown () {
        return exports.isShuttingDown();
    }
};

let handler;

let isReady = false;
let shuttingDown = false;
let shutdownCount = 0;
let shutdownRequested = false;
let exiting = false;

/**
 * Prepares the handler
 * @throw Throws an error if missing handler or if there is a problem with the handler
 */
exports.setup = function () {
    let handlerPath;

    if (process.env.HANDLER_PATH !== undefined) {
        handlerPath = path.join(__dirname, '../', process.env.HANDLER_PATH);
    } else {
        handlerPath = path.join(__dirname, '../app/handler/index.js');
    }

    log.debug('Setting up handler', { path: handlerPath });

    if (!isPathInside(handlerPath, path.join(__dirname, '../app/handler'))) {
        throw new Error('Handler file must be inside app/handler');
    }

    try {
        handler = require(handlerPath);
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            const moduleName = err.message.substring(err.message.indexOf('\'') + 1, err.message.indexOf('\n') - 1);

            let requireError;

            if (moduleName !== handlerPath) {
                requireError = new Error('Missing dependencies! Install them with `npm install`');
            } else {
                requireError = new Error('Missing handler file');
            }

            requireError.require = moduleName;

            throw requireError;
        }

        // Something is wrong with the handler
        throw err;
    }

    checkEnv();

    validate();

    bindThis();
};

exports.isReady = function () {
    return isReady;
};

exports.isShuttingDown = function () {
    return shutdownCount > 0;
};

exports.shutdownRequested = function () {
    return shutdownRequested;
};

exports.setReady = function () {
    isReady = true;
};

/**
 * Makes sure that every required environment variable is there
 */
function checkEnv () {
    REQUIRED_OPTS.forEach(function (optName) {
        if (!process.env[optName]) {
            throw new Error('Missing required environment variable "' + optName + '"');
        }
    });
}

/**
 * Makes sure every required event is added to the handler and adds exported functions
 * @throw Throws an error when missing required event listener
 */
function validate () {
    REQUIRED_EVENTS.forEach(function (event) {
        if (typeof handler[event] !== 'function') {
            throw new Error(`Missing required listener for the event "${event}" in handler`);
        }
    });

    OPTIONAL_EVENTS.forEach(function (event) {
        if (handler[event] !== undefined && typeof handler[event] !== 'function') {
            throw new Error(`exported value in handler for "${event}" must be a function`);
        } else if (handler[event] === undefined) {
            handler[event] = noop;
        }
    });

    for (const func in EXPORTED_FUNCTIONS) {
        if (Object.prototype.hasOwnProperty.call(EXPORTED_FUNCTIONS, func)) {
            if (handler[func] !== undefined) {
                throw new Error(`exported function "${func}" already exists`);
            }

            handler[func] = EXPORTED_FUNCTIONS[func];
        }
    }
}

/**
 * Binds client to every event
 */
function bindThis () {
    const client = require('../lib/client');

    REQUIRED_EVENTS.forEach(function (event) {
        handler[event] = handler[event].bind(client);
    });

    OPTIONAL_EVENTS.forEach(function (event) {
        handler[event] = handler[event].bind(client);
    });
}

function checkFiles (checks, done) {
    if (typeof checks === 'function') {
        done = checks;
        checks = 0;
    }

    if (!files.isWritingToFiles()) {
        // We are not writing to any files, stop the bot

        if (checks !== 0) {
            log.debug('Done writing files');
        }

        return done();
    }

    if (checks === 0) {
        log.warn('Writing to files, waiting for them to finish...');
    }

    // Files are still being written to, wait for them to be done
    setTimeout(function () {
        checkFiles(checks + 1, done);
    }, backoff(checks, 100));
}

function noop () {}

/**
 * Gets the handler
 * @return {Object}
 */
exports.getHandler = function () {
    return handler;
};
