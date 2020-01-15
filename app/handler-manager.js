const SteamUser = require('steam-user');
const path = require('path');
const isPathInside = require('is-path-inside');
const pm2 = require('pm2');

const log = require('lib/logger');

const REQUIRED_OPTS = ['STEAM_ACCOUNT_NAME', 'STEAM_PASSWORD', 'STEAM_SHARED_SECRET', 'STEAM_IDENTITY_SECRET'];
const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginKey', 'onNewTradeOffer', 'onLoginAttempts', 'onPollData', 'onPricelist'];
const OPTIONAL_EVENTS = ['onMessage', 'onFriendRelationship', 'onGroupRelationship', 'onPriceChange', 'onTradeOfferChanged', 'onTradeFetchError', 'onConfirmationAccepted', 'onConfirmationError', 'onLogin', 'onLoginFailure', 'onLoginThrottle', 'onInventoryUpdated', 'onCraftingCompleted', 'onUseCompleted', 'onDeleteCompleted', 'onTF2QueueCompleted', 'onQueue', 'onBptfAuth', 'onSchema', 'onHeartbeat', 'onListings'];
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
            callback(null, false);
            return;
        }

        log.warn('Stop has been initialized, stopping...');

        pm2.stop(process.env.pm_id, function (err) {
            if (err) {
                return callback(err);
            }

            return callback(null, true);
        });
    },
    shutdown: function (err, rudely = false) {
        log.debug('Shutdown has been initialized, stopping...', { err: err });

        shutdownCount++;

        if (rudely) {
            stop();
        }

        if (shutdownCount >= 10) {
            log.warn('Forcing exit...');
            stop();
        } else if (shutdownCount > 1) {
            return false;
        }

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

            log.warn('Exiting...');

            exiting = true;

            require('lib/manager').shutdown();
            require('lib/bptf-listings').shutdown();
            require('lib/client').logOff();

            // Listen for logger to finish
            log.on('finish', function () {
                process.exit(err ? 1 : 0);
            });

            // Stop the logger
            log.end();
        }
    },
    cleanup: function () {
        log.debug('Cleaning up');

        // This will disable the reciving of messages and other friend related events
        isReady = false;

        // Make the bot snooze on Steam, that way people will know it is not running
        require('lib/client').setPersona(SteamUser.EPersonaState.Snooze);

        // Disable login
        require('lib/client').autoRelogin = false;

        // Stop price updates
        require('lib/ptf-socket').disconnect();

        // Stop the polling of trade offers
        require('lib/manager').pollInterval = -1;

        // Stop heartbeat and inventory timers
        clearInterval(require('lib/bptf-listings')._heartbeatInterval);
        clearInterval(require('lib/bptf-listings')._inventoryInterval);
    },
    setLoginAttempts (attempts) {
        require('app/login-attempts').setAttempts(attempts);
    },
    setPollData: function (pollData) {
        require('app/trade').setPollData(pollData);
    },
    setPricelist: function (pricelist) {
        require('app/prices').setPricelist(pricelist);
    },
    acceptOffer (offer, callback) {
        require('app/trade').acceptOffer(offer, callback);
    },
    declineOffer (offer, callback) {
        require('app/trade').declineOffer(offer, callback);
    },
    sendOffer (offer, callback) {
        require('app/trade').sendOffer(offer, callback);
    },
    cancelOffer (offer, callback) {
        require('app/trade').cancelOffer(offer, callback);
    },
    getInventory (steamid, callback) {
        require('app/inventory').getInventory(steamid, callback);
    },
    getOwnInventory () {
        return require('app/inventory').getOwnInventory();
    },
    smeltMetal (defindex, amount) {
        require('app/crafting').smeltMetal(defindex, amount);
    },
    combineMetal (defindex, amount) {
        require('app/crafting').combineMetal(defindex, amount);
    },
    useItem (assetid) {
        require('app/crafting').useItem(assetid);
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
let shutdownCount = 0;
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
    const client = require('lib/client');

    REQUIRED_EVENTS.forEach(function (event) {
        handler[event] = handler[event].bind(client);
    });

    OPTIONAL_EVENTS.forEach(function (event) {
        handler[event] = handler[event].bind(client);
    });
}

function noop () {}

/**
 * Gets the handler
 * @return {Object}
 */
exports.getHandler = function () {
    return handler;
};
