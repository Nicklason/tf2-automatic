const REQUIRED_EVENTS = ['onRun', 'onLoginSuccessful', 'onLoginFailure', 'onTradeOfferUpdated', 'onPollData', 'onSchemaUpdated'];

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

    validateEvents();

    bindThis();
};

/**
 * Makes sure every required event is added to the handler
 * @throw Throws an error when missing required event listener
 */
function validateEvents () {
    REQUIRED_EVENTS.forEach(function (event) {
        if (typeof handler[event] !== 'function') {
            throw new Error(`Missing required listener for the event "${event}" in handler`);
        }
    });
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

/**
 * Gets the handler
 * @return {Object}
 */
exports.getHandler = function () {
    return handler;
};
