const path = require('path');
const isPathInside = require('is-path-inside');

const REQUIRED_EVENTS = ['onRun', 'onReady', 'onShutdown', 'onLoginThrottle', 'onLoginSuccessful', 'onLoginFailure', 'onLoginKey', 'onTradeOfferUpdated', 'onLoginAttempts'];
const OPTIONAL_EVENTS = ['onMessage', 'onPollData', 'onSchema', 'onHeartbeat', 'onListings', 'onActions'];
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
    setPollData (pollData) {
        require('lib/manager').pollData = pollData;
    }
};

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
