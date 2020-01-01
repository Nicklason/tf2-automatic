const SteamUser = require('steam-user');
const pluralize = require('pluralize');

const package = require('@root/package.json');

const log = require('lib/logger');

exports.onRun = require('handler/init');
exports.onShutdown = require('handler/shutdown');

exports.onReady = function () {
    this.gamesPlayed(package.name);
    this.setPersona(SteamUser.EPersonaState.Online);

    // Smelt metal if needed
    require('handler/crafting').keepMetalSupply();

    // Sort the inventory after crafting metal
    require('app/crafting').sortInventory(3);

    // Check friend requests that we got while offline
    require('handler/friends').checkFriendRequests();

    // Go through all items in the pricelist and check the listings
    require('handler/listings').checkAll();
};

exports.onTF2QueueCompleted = function () {
    this.gamesPlayed(package.name);
};

exports.onLogin = function () {
    if (exports.isReady()) {
        // We have relogged, set game and online
        this.gamesPlayed(package.name);
        this.setPersona(SteamUser.EPersonaState.Online);
    }
};

exports.onLoginFailure = function (err) {
    exports.shutdown(err);
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
