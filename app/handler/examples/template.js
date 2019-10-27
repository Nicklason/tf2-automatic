/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');

/**
 * Event listener for the run event
 * @param {Function} done The bot will only start once you call the done function
 * @description Event is emitted once the bot starts
 */
exports.onRun = function (done) {};

/**
 * Event listener for the shutdown event
 * @param {Function} done
 * @description Event is emitted once a shutdown has been requested. Same idea as the "ready" event, except after calling the done function the bot will stop and the process will be killed
 */
exports.onShutdown = function (done) {};

/**
 * Event listener for the ready event
 * @description Event is emitted shoryly after the bot has logged. The bot will be signed in, and the bptf-listings module will be initialized once the event is emitted.
 */
exports.onReady = function () {};

/**
 * Event listener for login throttle event
 * @param {Number} wait Amount of milliseconds that the bot will wait before attempting to log in
 * @description Event is emitted when the bot has detected it is being ratelimited, or if there has been many recent login attempts
 */
exports.onLoginThrottle = function (wait) {};

/**
 * Event listener for the login event
 * @description Event is emitted when the bot has logged in to Steam
 */
exports.onLoginSuccessful = function () {};

/**
 * Event listener for the login failure event
 * @param {Error} err Error emitted when a login attempt was made
 * @description Event is emitted if the bot fails to sign in on startup, this error is caught and parsed as an argument to the listener.
 */
exports.onLoginFailure = function (err) {
    // Graceful stop
    exports.shutdown();
};

/**
 * Event listener for the login key event
 * @param {String} loginKey Login key used to log in with instead of username and password
 * @description This event is emitted shortly after logging in, the login key can be saved and used to later sign in again.
 */
exports.onLoginKey = function (loginKey) {};

/**
 * Event listener for the trade offer updated event
 * @param {Object} offer The offer which state has changed
 * @param {Number} oldState null if the offer is new (current state is active)
 * @description This event is emitted when a new offer is received, or a received / sent offer has changed states
 */
exports.onTradeOfferUpdated = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Active && !offer.isOurOffer) {
        onNewTradeOffer.call(this, offer);
    }
};

function onNewTradeOffer (offer) {}

/**
 * Event listener for the poll data event
 * @param {Object} pollData
 * @description This event is emitted when the trade offer manager has emitted the pollData event
 */
exports.onPollData = function (pollData) {};

/**
 * Event listener for the schema event
 * @param {Object} schema Instance of tf2-schema schema
 * @description This event is emitted when the schema has been fetched
 */
exports.onSchema = function (schema) {};

/**
 * Event listener for the login attempts event
 * @param {Array<Number>} attempts List of unix epoch times for when a login attempt has been made
 * @description This event is emitted when a login attempt has been made
 */
exports.onLoginAttempts = function (attempts) {};

/**
 * Event listner for the heatbeat event
 * @param {Number} bumped Amount of listings bumped in this heartbeat on backpack.tf
 * @description This event is emitted when a heartbeat to backpack.tf has been made
 */
exports.onHeartbeat = function (bumped) {};

/**
 * Event listner for the listings event
 * @param {Array<Object>} listings A list of listings that the account has on backpack.tf
 * @description This event is emitted when the listings on backpack.tf has been fetched
 */
exports.onListings = function (listings) {};

/**
 * Event listner for the actions event
 * @param {Object} actions Actions used by the bptf-listings module (create and remove queue)
 * @description This event is emitted when the job queue for creating and removing listings on backpack.tf changes
 */
exports.onActions = function (actions) {};
