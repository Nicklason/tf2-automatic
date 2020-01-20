import pluralize from 'pluralize';
import SKU from 'tf2-sku';
import moment from 'moment';
import async from 'async';
import callbackQueue from 'callback-queue';
import request from '@nicklason/request-retry';

import log from '../../lib/logger';
import * as prices from '../prices';
import * as inventory from '../inventory';
import listingManager from '../../lib/bptf-listings';
import * as handlerManager from '../handler-manager';
import client from '../../lib/client';

import backoff from '../utils/exponentialBackoff';

const templates = {
    buy: process.env.BPTF_DETAILS_BUY || 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
    sell: process.env.BPTF_DETAILS_SELL || 'I am selling my %name% for %price%, I am selling %amount_trade%.'
};

let cancelListingCheck = false;
let checkingAllListings = false;
let removingAllListings = false;

let autobumpEnabled = false;
let autobumpTimeout;

/**
 * Checks if autobump is enabled and if the account is premium
 */
export function setupAutobump () {
    if (process.env.AUTOBUMP !== 'true') {
        // Autobump is not enabled
        return;
    }

    // Autobump is enabled, add heartbeat listener

    listingManager.removeListener('heartbeat', onHeartbeat);
    listingManager.on('heartbeat', onHeartbeat);

    // Get account info
    checkAccountInfo();
};

function onHeartbeat () {
    // Check account info on heartbeat
    checkAccountInfo();
}

function checkAccountInfo () {
    log.debug('Checking account info');
    getAccountInfo(function (err, info) {
        if (err) {
            log.warn('Failed to get account info from backpack.tf: ', err);
            return;
        }

        log.debug('Got account info');

        if (autobumpEnabled && info.premium === true) {
            log.warn('Disabling autobump! - Your account is premium, no need to forcefully bump listings');
            disableAutobump();
        } else if (!autobumpEnabled && info.premium !== true) {
            log.warn('Enabling autobump! - Consider paying for backpack.tf premium or donating instead of forcefully autobumping: https://backpack.tf/donate');
            enableAutobump();
        }
    });
}

export function enableAutobump () {
    if (autobumpEnabled) {
        return;
    }

    log.debug('Enabled autobump');

    autobumpEnabled = true;

    clearTimeout(autobumpTimeout);

    autobumpTimeout = setTimeout(doneWait, 30 * 60 * 1000);

    function doneWait () {
        log.debug('Autobumping...');

        async.eachSeries([
            function (callback) {
                redoListings(callback);
            },
            function (callback) {
                waitForListings(callback);
            }
        ], function (item, callback) {
            if (handlerManager.shutdownRequested()) {
                // Could return an error, but it is not really an error
                return;
            }

            // Call function
            item(callback);
        }, function () {
            log.debug('Done bumping');
            if (autobumpEnabled) {
                log.debug('Waiting 30 minutes before bumping again...');
                autobumpTimeout = setTimeout(doneWait, 30 * 60 * 1000);
            }
        });
    }
};

export function disableAutobump () {
    clearTimeout(autobumpTimeout);
    autobumpEnabled = false;

    log.debug('Disabled autobump');
};

function getAccountInfo (callback) {
    const steamID64 = client.steamID.getSteamID64();

    const options = {
        url: 'https://backpack.tf/api/users/info/v1',
        method: 'GET',
        qs: {
            key: process.env.BPTF_API_KEY,
            steamids: steamID64
        },
        gzip: true,
        json: true
    };

    request(options, function (err, reponse, body) {
        if (err) {
            return callback(err);
        }

        return callback(null, body.users[steamID64]);
    });
}

export function redoListings (callback) {
    if (callback === undefined) {
        callback = noop;
    }

    removeAll(function () {
        checkAll(callback);
    });
};

export function checkBySKU (sku, data) {
    const item = SKU.fromString(sku);

    const match = data && data.enabled === false ? null : prices.get(sku, true);

    // We don't actually have a buy order if it is a skin, but this makes the code not make a new buy order
    let hasBuyListing = item.paintkit !== null;
    let hasSellListing = false;

    const amountCanBuy = inventory.amountCanTrade(sku, true);
    const amountCanSell = inventory.amountCanTrade(sku, false);

    listingManager.findListings(sku).forEach((listing) => {
        if (listing.intent === 1 && hasSellListing) {
            // Already have a sell order
            listing.remove();
            return;
        }

        if (listing.intent === 0) {
            hasBuyListing = true;
        } else if (listing.intent === 1) {
            hasSellListing = true;
        }

        if (match === null || (match.intent !== 2 && match.intent !== listing.intent)) {
            // We are not trading the item, remove the listing
            listing.remove();
        } else if ((listing.intent === 0 && amountCanBuy <= 0) || (listing.intent === 1 && amountCanSell <= 0)) {
            // We are not buying / selling more, remove the listing
            listing.remove();
        } else {
            const newDetails = getDetails(listing.intent, match);
            if (listing.details !== newDetails) {
                // Listing details don't match, update listing with new details and price
                const currencies = match[listing.intent === 0 ? 'buy' : 'sell'];
                listing.update({
                    time: match.time || moment().unix(),
                    details: getDetails(listing.intent, match),
                    currencies: currencies
                });
            }
        }
    });

    if (match !== null && match.enabled === true) {
        const items = inventory.findBySKU(sku);

        // TODO: Check if we are already making a listing for same type of item + intent

        if (!hasBuyListing && (match.intent === 0 || match.intent === 2) && amountCanBuy > 0) {
            listingManager.createListing({
                time: match.time || moment().unix(),
                sku: sku,
                intent: 0,
                details: getDetails(0, match),
                currencies: match.buy
            });
        }

        if (!hasSellListing && (match.intent === 1 || match.intent === 2) && amountCanSell > 0) {
            listingManager.createListing({
                time: match.time || moment().unix(),
                id: items[items.length - 1],
                intent: 1,
                details: getDetails(1, match),
                currencies: match.sell
            });
        }
    }
};

/**
 * Checks entire pricelist and updates listings
 * @param {Function} callback
 */
export function checkAll (callback) {
    if (callback === undefined) {
        callback = noop;
    }

    log.debug('Checking all');

    if (!removingAllListings) {
        doneRemovingAll();
        return;
    }

    // Add callback to removeAll
    callbackQueue.add('removeAll', callback)(function () {
        // Done removing all, now check all
        doneRemovingAll();
    });

    function doneRemovingAll () {
        const next = callbackQueue.add('checkAll', callback);
        if (!next) {
            return;
        }

        checkingAllListings = true;

        // Prioritize items in the pricelist that we also have in the inventory
        const pricelist = prices.getPricelist().sort((a, b) => {
            // Using sort because then we could add other ways to prioritize items
            return inventory.findBySKU(b.sku).length - inventory.findBySKU(a.sku).length;
        });

        log.debug('Checking listings for ' + pluralize('items', pricelist.length, true) + '...');

        recursiveCheckPricelist(pricelist, function () {
            checkingAllListings = false;
            log.debug('Done checking listings');
            next(null);
        });
    }
};

/**
 * A non-blocking function for checking listings
 * @param {Array} pricelist
 * @param {Function} done
 */
function recursiveCheckPricelist (pricelist, done) {
    let index = 0;

    iteration();

    function iteration () {
        if (pricelist.length <= index || cancelListingCheck) {
            cancelListingCheck = false;
            done();
            return;
        }

        setImmediate(function () {
            checkBySKU(pricelist[index].sku, pricelist[index]);

            index++;
            iteration();
        });
    }
}

export function waitForListings (callback) {
    const next = callbackQueue.add('waitForListings', callback);
    if (!next) {
        return;
    }

    waitForListings(next);
};

function waitForListings (callback) {
    let checks = 0;
    check();

    function check () {
        log.debug('Checking listings...');
        checks++;
        const currentCount = listingManager.listings.length;

        listingManager.getListings(function (err) {
            if (err) {
                return callback(err);
            }

            if (listingManager.listings.length !== currentCount) {
                log.debug('Count changed: ' + listingManager.listings.length + ' listed, ' + currentCount + ' previously');
                setTimeout(function () {
                    check();
                }, backoff(checks));
            } else {
                log.debug('Count didn\'t change');
                return callback(null);
            }
        });
    }
}

/**
 * Guaranteed way to remove all listings on backpack.tf
 * @param {function} callback
 */
export function removeAll (callback) {
    if (checkingAllListings) {
        cancelListingCheck = true;
    }

    log.debug('Removing all');

    const next = callbackQueue.add('removeAll', callback);
    if (!next) {
        return;
    }

    removeAll(next);
};

function removeAll (callback) {
    removingAllListings = true;

    // Clear create queue
    listingManager.actions.create = [];

    // Wait for backpack.tf to finish creating / removing listings
    waitForListings(function (err) {
        if (err) {
            return callback(err);
        }

        if (listingManager.listings.length === 0) {
            log.debug('We have no listings');
            removingAllListings = false;
            return callback(null);
        }

        log.debug('Removing all listings...');

        // Remove all current listings
        listingManager.listings.forEach((listing) => listing.remove());

        // Clear timeout
        clearTimeout(listingManager._timeout);

        // Remove listings
        listingManager._processActions(function (err) {
            if (err) {
                return callback(err);
            }

            // The request might fail, if it does we will try again
            removeAll(callback);
        });
    });
}

function getDetails (intent, pricelistEntry) {
    const buying = intent === 0;
    const key = buying ? 'buy' : 'sell';
    const details = templates[key]
        .replace(/%price%/g, pricelistEntry[key].toString())
        .replace(/%name%/g, pricelistEntry.name)
        .replace(/%max_stock%/g, pricelistEntry.max)
        .replace(/%current_stock%/g, inventory.getAmount(pricelistEntry.sku).toString())
        .replace(/%amount_trade%/g, inventory.amountCanTrade(pricelistEntry.sku, buying).toString());

    return details;
}

function noop () {}
