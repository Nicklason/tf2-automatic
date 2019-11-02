/* eslint-disable no-console */

exports.onRun = function (done) {
    console.log('The bot is starting...');

    done();
};

exports.onShutdown = function (err, done) {
    console.log('The bot is stopping...');
    console.log(err);

    done();
};

exports.onReady = function () {
    console.log('Everything is ready!');

    this.gamesPlayed(['Two plus two is four']);

    // Smelt refined metal into three reclaimed
    exports.smeltMetal(5002, 1);
    // Smelt one reclaimed metal into three scrap
    exports.smeltMetal(5001, 1);

    // Combine three scrap metal into one reclaimed
    exports.combineMetal(5000, 1);
    // Combine three reclaimed metal into one refined
    exports.combineMetal(5001, 1);
};

exports.onCraftingQueueCompleted = function () {
    console.log('Finished crafting queue');
    this.gamesPlayed(['Minus one that\'s three']);
};

exports.onCraftingCompleted = function (sku, assetids) {
    console.log('Crafted ' + sku + ' (' + assetids.join(', ') + ')');
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

exports.onTradeOfferUpdated = function (offer, oldState) {};

exports.onNewTradeOffer = function (offer) {};

exports.onLoginAttempts = function (attempts) {};
