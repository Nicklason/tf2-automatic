const path = require('path');
const isPathInside = require('is-path-inside');

const log = require('lib/logger');

const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginKey', 'onNewTradeOffer', 'onLoginAttempts', 'onPollData', 'onPricelist'];
const OPTIONAL_EVENTS = ['onMessage', 'onFriendRelationship', 'onPriceChange', 'onTradeOfferChanged', 'onTradeFetchError', 'onConfirmationAccepted', 'onConfirmationError', 'onLoginSuccessful', 'onLoginFailure', 'onLoginThrottle', 'onInventoryUpdated', 'onCraftingCompleted', 'onUseCompleted', 'onDeleteCompleted', 'onTF2QueueCompleted', 'onBptfAuth', 'onSchema', 'onHeartbeat', 'onListings', 'onActions'];
const EXPORTED_FUNCTIONS = {
    shutdown: function (err) {
        log.debug('Shutdown has been initialized', { err: err });

        const manager = require('lib/manager');

        // Stop the polling of trade offers
        manager.pollInterval = -1;

        // TODO: Check if a poll is being made before stopping the bot

        handler.onShutdown(err, function () {
            log.debug('Shutdown callback has been called, cleaning up');

            manager.shutdown();
            require('lib/bptf-listings').shutdown();
            require('lib/ptf-socket').disconnect();
            require('lib/client').logOff();

            log.end();

            process.exit(err === null ? 0 : 1);
        });
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
    }
};

let handler;

let isReady = false;

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
        if (err.code === 'MODULE_NOT_FOUND' && err.message.indexOf(handlerPath) !== -1) {
            throw new Error('Missing handler file');
        }

        // Something is wrong with the handler
        throw err;
    }

    validate();

    bindThis();
};

exports.isReady = function () {
    return isReady;
};

exports.setReady = function () {
    isReady = true;
};

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
