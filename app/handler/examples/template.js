/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');

exports.onRun = function (done) {};

exports.onLoginSuccessful = function () {};

exports.onLoginFailure = function (err) {};

exports.onTradeOfferUpdated = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Active && !offer.isOurOffer) {
        onNewTradeOffer.call(this, offer);
    }
};

function onNewTradeOffer (offer) {}

exports.onPollData = function (pollData) {};

exports.onSchemaUpdated = function (schema) {};
