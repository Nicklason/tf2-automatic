const SteamUser = require('steam-user');
const pluralize = require('pluralize');

const package = require('@root/package.json');

const prices = require('app/prices');
const listingManager = require('lib/bptf-listings');
const log = require('lib/logger');

exports.onRun = require('handler/init');
exports.onShutdown = require('handler/shutdown');

exports.onReady = function () {
    log.info(package.name + ' v' + package.version + ' is ready! ' + pluralize('item', prices.getPricelist().length, true) + ' in pricelist, ' + pluralize('listing', listingManager.listings.length, true) + ' on www.backpack.tf (cap: ' + listingManager.cap + ')');

    this.gamesPlayed(package.name);
    this.setPersona(SteamUser.EPersonaState.Online);

    // Smelt metal if needed
    require('handler/crafting').keepMetalSupply();

    // Sort the inventory after crafting metal
    require('app/crafting').sortInventory(3);

    // Check friend requests that we got while offline
    require('handler/friends').checkFriendRequests();

    // Check group invites that we got while offline
    require('handler/groups').checkGroupInvites();

    require('handler/listings').setupAutobump();
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

exports.onHeartbeat = function (bumped) {
    log.debug('Heartbeat sent to www.backpack.tf' + (bumped > 0 ? '; Bumped ' + pluralize('listing', bumped, true) : '') + '.');
};

exports.onMessage = require('handler/commands').handleMessage;
exports.onPriceChange = require('handler/listings').checkBySKU;
exports.onNewTradeOffer = require('handler/trades').newOffer;
exports.onTradeOfferChanged = require('handler/trades').offerChanged;
exports.onFriendRelationship = require('handler/friends').friendRelationChanged;
exports.onGroupRelationship = require('handler/groups').groupRelationChanged;

exports.onBptfAuth = function (bptfAuth) {
    bptfAuth.private = true;
    log.warn('Please add the backpack.tf API key and access token to the environment variables!', bptfAuth);
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
