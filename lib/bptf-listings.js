const BptfListings = require('bptf-listings');

const log = require('lib/logger');

const handlerManager = require('app/handler-manager');

const listingManager = new BptfListings({
    token: process.env.BPTF_ACCESS_TOKEN,
    batchSize: 50,
    waitTime: 100
});

listingManager.on('heartbeat', heartbeatEvent);
listingManager.on('listings', listingsEvent);
listingManager.on('actions', actionsEvent);
listingManager.on('error', errorEvent);

function heartbeatEvent (bumped) {
    handlerManager.getHandler().onHeartbeat(bumped);
}

function listingsEvent (listings) {
    handlerManager.getHandler().onListings(listings);
}

function actionsEvent (actions) {
    handlerManager.getHandler().onActions(actions);
}

function errorEvent (err) {
    log.warn(err.message, { event: 'error', from: 'bptf-listings' });
}

module.exports = listingManager;
