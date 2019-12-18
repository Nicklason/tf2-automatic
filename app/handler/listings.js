
const log = require('lib/logger');
const prices = require('app/prices');
const inventory = require('app/inventory');
const listingManager = require('lib/bptf-listings');

const templates = {
    buy: process.env.BPTF_DETAILS_BUY || 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
    sell: process.env.BPTF_DETAILS_SELL || 'I am selling my %name% for %price%, I have %current_stock%.'
};

exports.checkBySKU = function (sku) {
    const match = prices.get(sku, true);

    let hasBuyListing = false;
    let hasSellListing = false;

    const amountCanBuy = inventory.amountCanTrade(sku, true);
    const amountCanSell = inventory.amountCanTrade(sku, false);

    listingManager.findListings(sku).forEach((listing) => {
        if (listing.intent === 1 && hasSellListing) {
            // Already have a sell order
            log.debug('Already have a sell order, removing duplicate');
            listing.remove();
        }

        if (listing.intent === 0) {
            hasBuyListing = true;
        } else if (listing.intent === 1) {
            hasSellListing = true;
        }

        if (match === null || (match.intent !== 2 && match.intent !== listing.intent) || match.enabled === false) {
            // We are not trading the item, remove the listing
            log.debug('Removing listing because we are not trading the item', listing);
            listing.remove();
        } else if ((listing.intent === 0 && amountCanBuy <= 0) || (listing.intent === 1 && amountCanSell <= 0)) {
            // We are not buying / selling more, remove the listing
            log.debug('Removing listing because we are not buying / selling more');
            listing.remove();
        } else {
            const newDetails = getDetails(listing.intent, match);
            if (listing.details !== newDetails) {
                log.debug('Listing details are outdated, updating it');
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
            log.debug('We can buy items, create listing');
            listingManager.createListing({
                sku: sku,
                intent: 0,
                details: getDetails(0, match),
                currencies: match.buy
            });
        }

        if (!hasSellListing && (match.intent === 1 || match.intent === 2) && amountCanSell > 0) {
            log.debug('We can sell items, create listing');
            listingManager.createListing({
                id: items[items.length - 1],
                intent: 1,
                details: getDetails(1, match),
                currencies: match.sell
            });
        }
    }
};

exports.checkAll = function () {
    const pricelist = prices.getPricelist();

    for (let i = 0; i < pricelist.length; i++) {
        exports.checkBySKU(pricelist[i].sku, pricelist[i]);
    }
};

function getDetails (intent, pricelistEntry) {
    const key = intent === 0 ? 'buy' : 'sell';
    const details = templates[intent === 0 ? 'buy' : 'sell']
        .replace(/%price%/g, pricelistEntry[key].toString())
        .replace(/%name%/g, pricelistEntry.name)
        .replace(/%max_stock%/g, pricelistEntry.max - pricelistEntry.min)
        .replace(/%current_stock%/g, inventory.getAmount(pricelistEntry.sku));

    return details;
}
