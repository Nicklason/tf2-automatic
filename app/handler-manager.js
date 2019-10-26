const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginThrottle', 'onLoginSuccessful', 'onLoginFailure', 'onTradeOfferUpdated', 'onPollData', 'onSchema'];
const OPTIONAL_EVENTS = ['onHeartbeat', 'onListings', 'onActions'];
const EXPORTED_FUNCTIONS = {
    shutdown: function () {
        handler.onShutdown(function () {
            require('lib/manager').shutdown();
            require('lib/bptf-listings').stop();
            require('lib/ptf-socket').disconnect();
            // Probably not needed, but just to be safe
            require('lib/client').logOff();
        });
    }
};

let handler;

/**
 * Prepares the handler
 * @throw Throws an error if missing handler or if there is a problem with the handler
 */
exports.setup = function () {
    try {
        handler = require('handler');
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
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
}

function noop () {}

/**
 * Gets the handler
 * @return {Object}
 */
exports.getHandler = function () {
    return handler;
};
