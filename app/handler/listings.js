const pluralize = require('pluralize');
const SKU = require('tf2-sku');

const log = require('lib/logger');
const prices = require('app/prices');
const inventory = require('app/inventory');
const listingManager = require('lib/bptf-listings');

const backoff = require('utils/exponentialBackoff');

const templates = {
    buy: process.env.BPTF_DETAILS_BUY || 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
    sell: process.env.BPTF_DETAILS_SELL || 'I am selling my %name% for %price%, I am selling %amount_trade%.'
};

exports.checkBySKU = function (sku, data) {
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
                sku: sku,
                intent: 0,
                details: getDetails(0, match),
                currencies: match.buy
            });
        }

        if (!hasSellListing && (match.intent === 1 || match.intent === 2) && amountCanSell > 0) {
            listingManager.createListing({
                id: items[items.length - 1],
                intent: 1,
                details: getDetails(1, match),
                currencies: match.sell
            });
        }
    }
};

exports.checkAll = function (callback) {
    // Wait for listings to be made / removed
    waitForListings(function (err) {
        if (err) {
            return callback(err);
        }

        // Remove all listings
        listingManager.listings.forEach((listing) => listing.remove());

        // Clear timeout
        clearTimeout(listingManager._timeout);

        // Clear create queue if there were somehow listings in that
        listingManager.actions.create = [];

        const removeCount = listingManager.actions.remove.length;

        // Make bptf-listings process actions
        listingManager._processActions(function (err) {
            if (err) {
                return callback(err);
            }

            if (removeCount !== 0) {
                log.debug('Removed listings');
            }

            const pricelist = prices.getPricelist();

            let index = 0;
            const chunkSize = 50;

            const interval = setInterval(function () {
                const chunk = pricelist.slice(index, index + chunkSize);

                if (chunk.length === 0) {
                    log.debug('Enqueued all listings');
                    return doneCheckingAll();
                }

                log.debug('Enqueueing ' + pluralize('listing', chunk.length, true) + '...');

                for (let i = 0; i < chunk.length; i++) {
                    exports.checkBySKU(chunk[i].sku, pricelist[i]);
                }

                index += chunkSize;
            }, 100);

            const timeout = setTimeout(function () {
                log.debug('Did not create any listings');
                doneCheckingAll();
            }, 1000);

            listingManager.on('actions', onActionsEvent);

            function onActionsEvent (actions) {
                // Got actions event, stop the timeout
                clearTimeout(timeout);
                // Don't need to check for listings we already have because they will be deleted
                if (actions.create.length >= listingManager.cap || (listingManager._listingsWaitingForRetry() + listingManager._listingsWaitingForInventoryCount() - actions.create.length === 0 && actions.remove.length === 0)) {
                    log.debug('Reached listing cap / created all listings');
                    // Reached listing cap / finished adding listings, stop
                    doneCheckingAll();
                }
            }

            function doneCheckingAll () {
                log.debug('Done enqueing listings');

                clearTimeout(timeout);
                clearInterval(interval);
                listingManager.removeListener('actions', onActionsEvent);
                callback(null);
            }
        });
    });
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

function getDetails (intent, pricelistEntry) {
    const buying = intent === 0;
    const key = buying ? 'buy' : 'sell';
    const details = templates[key]
        .replace(/%price%/g, pricelistEntry[key].toString())
        .replace(/%name%/g, pricelistEntry.name)
        .replace(/%max_stock%/g, pricelistEntry.max)
        .replace(/%current_stock%/g, inventory.getAmount(pricelistEntry.sku))
        .replace(/%amount_trade%/g, inventory.amountCanTrade(pricelistEntry.sku, buying));

    return details;
}
