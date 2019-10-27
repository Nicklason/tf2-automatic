/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');
exports.onRun = function (done) {
    console.log('The bot is starting...');

    done();
};

exports.onShutdown = function (done) {
    console.log('The bot is stopping...');

    done();
};

exports.onReady = function () {
    console.log('Everything is ready!');
};

exports.onLoginThrottle = function (wait) {
    console.log('Waiting ' + wait + ' ms before trying to sign in...');
};

exports.onLoginSuccessful = function () {
    console.log('Logged into Steam!');
};

exports.onLoginFailure = function (err) {
    console.log('An error occurred while trying to sign into Steam: ' + err.message);

    exports.shutdown();
};

exports.onLoginKey = function (loginKey) {};

exports.onTradeOfferUpdated = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Active && !offer.isOurOffer) {
        onNewTradeOffer.call(this, offer);
    } else if (oldState !== null) {
        console.log('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
    }
};

function onNewTradeOffer (offer) {
    console.log('Received an offer from ' + offer.partner.getSteamID64());
}

exports.onPollData = function (pollData) {};

exports.onSchema = function (schema) {};

exports.onLoginAttempts = function (attempts) {};
