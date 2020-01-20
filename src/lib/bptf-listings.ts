import BptfListings from 'bptf-listings';

import log from './logger';

import * as handlerManager from '../app/handler-manager';

const listingManager = new BptfListings({
    token: process.env.BPTF_ACCESS_TOKEN,
    batchSize: 25,
    waitTime: 100
});

listingManager.on('heartbeat', heartbeatEvent);
listingManager.on('listings', listingsEvent);
listingManager.on('error', errorEvent);

function heartbeatEvent (bumped) {
    handlerManager.getHandler().onHeartbeat(bumped);
}

function listingsEvent (listings) {
    handlerManager.getHandler().onListings(listings);
}

function errorEvent (err) {
    log.warn(err.message, { event: 'error', from: 'bptf-listings' });
}

export default listingManager;
