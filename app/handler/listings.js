const pluralize = require('pluralize');

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
    setImmediate(function () {
        const match = data && data.enabled === false ? null : prices.get(sku, true);

        let hasBuyListing = false;
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
    });
};

/**
 * Checks entire pricelist and updates listings
 * @param {Function} callback
 */
exports.checkAll = function (callback) {
    if (callback === undefined) {
        callback = noop;
    }

    // Wait for listings to be made / removed
    waitForListings(function (err) {
        if (err) {
            return callback(err);
        }

        const pricelist = prices.getPricelist();

        log.debug('Checking listings for ' + pluralize('items', pricelist.length, true) + '...');

        recursiveCheckPricelist(pricelist, function () {
            log.debug('Done checking listings');
            callback(null);
        });
    });
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
        if (pricelist.length <= index) {
            done();
            return;
        }

        setImmediate(function () {
            exports.checkBySKU(pricelist[index].sku, pricelist[index]);

            index++;
            iteration();
        });
    }
}

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
exports.removeAll = function (callback) {
    // Clear create queue
    listingManager.actions.create = [];

    // Wait for backpack.tf to finish creating / removing listings
    waitForListings(function (err) {
        if (err) {
            return callback(err);
        }

        if (listingManager.listings.length === 0) {
            log.debug('We have no listings');
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
            exports.removeAll(callback);
        });
    });
};

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

function noop () {}
