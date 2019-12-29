const SteamUser = require('steam-user');

const package = require('@root/package.json');

const log = require('lib/logger');

exports.onRun = require('handler/init');
exports.onShutdown = require('handler/shutdown');

exports.onReady = function () {
    this.gamesPlayed(package.name);
    this.setPersona(SteamUser.EPersonaState.Online);

    // Smelt metal if needed
    require('handler/crafting').keepMetalSupply();

    // Check friend requests that we got while offline
    require('handler/friends').checkFriendRequests();

    // Go through all items in the pricelist and check the listings
    require('handler/listings').checkAll();
};

exports.onTF2QueueCompleted = function () {
    this.gamesPlayed(package.name);
};

exports.onMessage = require('handler/commands').handleMessage;
exports.onPriceChange = require('handler/listings').checkBySKU;
exports.onNewTradeOffer = require('handler/trades').newOffer;
exports.onTradeOfferChanged = require('handler/trades').offerChanged;
exports.onFriendRelationship = require('handler/friends').friendRelationChanged;

exports.onBptfAuth = function (bptfAuth) {
    log.warn('Please add the backpack.tf API key and access token to the config!', bptfAuth);
};

[{
    event: 'onLoginKey',
    json: false
}, {
    event: 'onLoginAttempts',
    json: true
}, {
    event: 'onPollData',
    json: true
}, {
    event: 'onPricelist',
    json: true
}].forEach(function (v) {
    exports[v.event] = function (data) {
        require('handler/save')(v, data);
    };
});
