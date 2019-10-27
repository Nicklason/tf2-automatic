/* eslint-disable no-console */

const manager = require('lib/manager');

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

    manager.loadInventory(440, 2, true, function (err, inventory) {
        if (err) {
            console.log('Error occurred while loading inventory: ' + err.message);
            return;
        }

        inventory.forEach(function (item) {
            console.log(`sku: ${item.getSKU()}, name: ${item.getName()}`);
        });
    });
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

exports.onTradeOfferUpdated = function (offer, oldState) {};

exports.onPollData = function (pollData) {};

exports.onSchema = function (schema) {};

exports.onLoginAttempts = function (attempts) {};
