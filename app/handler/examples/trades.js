/* eslint-disable no-console */

const TradeOfferManager = require('steam-tradeoffer-manager');

exports.onRun = function (done) {
    console.log('The bot is starting...');

    done();
};

exports.onShutdown = function (error, done) {
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

exports.onMessage = function (steamID, message) {};

exports.onNewTradeOffer = function (offer, done) {
    console.log('New offer from ' + offer.partner.getSteamID64());

    const ourItemsDict = {};

    for (let i = 0; i < offer.itemsToGive.length; i++) {
        const item = offer.itemsToGive[i];

        if (item.appid != 440) {
            console.log('Offer contains items not from TF2');
            return done('decline');
        }

        const sku = item.getSKU();
        ourItemsDict[sku] = (ourItemsDict[sku] || 0) + 1;
    }

    const theirItemsDict = {};

    for (let i = 0; i < offer.itemsToReceive.length; i++) {
        const item = offer.itemsToReceive[i];

        if (item.appid != 440) {
            console.log('Offer contains items not from TF2');
            return done('decline');
        }

        const sku = item.getSKU();
        ourItemsDict[sku] = (ourItemsDict[sku] || 0) + 1;
    }

    console.log('Our items:');
    console.log(ourItemsDict);

    console.log('Their items:');
    console.log(theirItemsDict);

    let ourValue = 0;
    let theirValue = 0;

    // check prices of items
    ourValue += 3;
    theirValue += 1;

    if (theirValue >= ourValue) {
        console.log('User is offering enough');
        done('accept');
    } else {
        console.log('User is not offering enough');
        done('decline');
    }
};

exports.onTradeOfferUpdated = function (offer, oldState) {
    console.log('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
};

exports.onLoginAttempts = function (attempts) {};
