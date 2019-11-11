const path = require('path');
const isPathInside = require('is-path-inside');
const TradeOfferManager = require('steam-tradeoffer-manager');

const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginThrottle', 'onLoginSuccessful', 'onLoginFailure', 'onLoginKey', 'onNewTradeOffer', 'onTradeOfferUpdated', 'onLoginAttempts'];
const OPTIONAL_EVENTS = ['onMessage', 'onFriendRelationship', 'onTradeFetchError', 'onTradeAcceptError', 'onTradeDeclineError', 'onInventoryUpdated', 'onCraftingCompleted', 'onCraftingQueueCompleted', 'onPollData', 'onSchema', 'onHeartbeat', 'onListings', 'onActions'];
const EXPORTED_FUNCTIONS = {
    shutdown: function (err) {
        handler.onShutdown(err, function () {
            require('lib/manager').shutdown();
            require('lib/bptf-listings').stop();
            require('lib/ptf-socket').disconnect();
            require('lib/client').logOff();

            process.exit(err === null ? 0 : 1);
        });
    },
    setLoginAttempts (attempts) {
        require('app/login-attempts').setAttempts(attempts);
    },
    setPollData: setPollData,
    acceptOffer (offer, callback) {
        require('app/trade').acceptOffer(offer, callback);
    },
    declineOffer (offer, callback) {
        require('app/trade').declineOffer(offer, callback);
    },
    sendOffer (offer, callback) {
        require('app/trade').sendOffer(offer, callback);
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
    }
};

function setPollData (pollData) {
    // Go through sent and received offers

    const activeOrCreatedNeedsConfirmation = [];

    for (const id in pollData.sent) {
        if (!Object.prototype.hasOwnProperty.call(pollData.sent, id)) {
            continue;
        }

        const state = pollData.sent[id];

        if (state === TradeOfferManager.ETradeOfferState.Active || state === TradeOfferManager.EConfirmationMethod.CreatedNeedsConfirmation) {
            activeOrCreatedNeedsConfirmation.push(id);
        }
    }

    for (const id in pollData.received) {
        if (!Object.prototype.hasOwnProperty.call(pollData.received, id)) {
            continue;
        }

        const state = pollData.received[id];

        if (state === TradeOfferManager.ETradeOfferState.Active) {
            activeOrCreatedNeedsConfirmation.push(id);
        }
    }

    const tradeManager = require('app/trade');

    // Go through all sent / received offers and mark the items as in trade
    for (let i = 0; i < activeOrCreatedNeedsConfirmation.length; i++) {
        const id = activeOrCreatedNeedsConfirmation[i];

        const pollData = pollData.offerData[id] || {};
        const assetids = pollData.assetids || [];

        for (let i = 0; i < assetids.length; i++) {
            tradeManager.setItemInTrade(assetids[i]);
        }
    }

    require('lib/manager').pollData = pollData;
}

let handler;

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
