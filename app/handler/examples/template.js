/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');

exports.onRun = function (done) {};

exports.onShutdown = function (done) {};

exports.onReady = function () {};

exports.onLoginThrottle = function (wait) {};

exports.onLoginSuccessful = function () {};

exports.onLoginFailure = function (err) {
    // Graceful stop
    exports.shutdown();
};

exports.onLoginKey = function (loginKey) {};

exports.onTradeOfferUpdated = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Active && !offer.isOurOffer) {
        onNewTradeOffer.call(this, offer);
    }
};

function onNewTradeOffer (offer) {}

exports.onPollData = function (pollData) {};

exports.onSchema = function (schema) {};

exports.onLoginAttempts = function (attempts) {};
