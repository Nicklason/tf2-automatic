/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');

exports.onRun = function (done) {};

exports.onReady = function () {};

exports.onLoginSuccessful = function () {};

exports.onLoginFailure = function (err) {};

exports.onTradeOfferUpdated = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Active && !offer.isOurOffer) {
        onNewTradeOffer.call(this, offer);
    }
};

function onNewTradeOffer (offer) {}

exports.onPollData = function (pollData) {};

exports.onSchema = function (schema) {};
