import SteamUser from 'steam-user';
import pluralize from 'pluralize';

import pjson from 'pjson';

import * as prices from '../prices';
import listingManager from '../../lib/bptf-listings';
import log from '../../lib/logger';
import client from '../../lib/client';

exports.onRun = require('../handler/init');
exports.onShutdown = require('../handler/shutdown');

export function onReady () {
    log.info(pjson.name + ' v' + pjson.version + ' is ready! ' + pluralize('item', prices.getPricelist().length, true) + ' in pricelist, ' + pluralize('listing', listingManager.listings.length, true) + ' on www.backpack.tf (cap: ' + listingManager.cap + ')');

    client.gamesPlayed(pjson.name);
    client.setPersona(SteamUser.EPersonaState.Online);

    // Smelt metal if needed
    require('../handler/crafting').keepMetalSupply();

    // Sort the inventory after crafting metal
    require('../crafting').sortInventory(3);

    // Check friend requests that we got while offline
    require('../handler/friends').checkFriendRequests();

    // Check group invites that we got while offline
    require('../handler/groups').checkGroupInvites();

    require('../handler/listings').setupAutobump();
};

export function onTF2QueueCompleted () {
    client.gamesPlayed(pjson.name);
};

export function onLogin () {
    // @ts-ignore
    if (exports.isReady()) {
        // We have relogged, set game and online
        client.gamesPlayed(pjson.name);
        client.setPersona(SteamUser.EPersonaState.Online);
    }
};

export function onHeartbeat (bumped) {
    log.debug('Heartbeat sent to www.backpack.tf' + (bumped > 0 ? '; Bumped ' + pluralize('listing', bumped, true) : '') + '.');
};

exports.onMessage = require('./commands').handleMessage;
exports.onPriceChange = require('./listings').checkBySKU;
exports.onNewTradeOffer = require('./trades').newOffer;
exports.onTradeOfferChanged = require('./trades').offerChanged;
exports.onFriendRelationship = require('./friends').friendRelationChanged;
exports.onGroupRelationship = require('./groups').groupRelationChanged;

export function onBptfAuth (bptfAuth) {
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
        require('./save')(v, data);
    };
});
