const prices = require('app/prices');
const inventory = require('app/inventory');
const listingManager = require('lib/bptf-listings');

const templates = {
    buy: process.env.BPTF_DETAILS_BUY || 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
    sell: process.env.BPTF_DETAILS_SELL || 'I am selling my %name% for %price%, I am selling %amount_trade%.'
};

exports.checkBySKU = function (sku, data) {
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
};

exports.checkAll = function (callback) {
    // Remove all listings
    listingManager.listings.forEach((listing) => listing.remove());

    const pricelist = prices.getPricelist();

    let index = 0;

    const interval = setInterval(function () {
        const chunk = pricelist.slice(index, index + 50);

        if (chunk.length === 0) {
            return clearInterval(interval);
        }

        for (let i = 0; i < chunk.length; i++) {
            exports.checkBySKU(chunk[i].sku, pricelist[i]);
        }

        index += 50;
    }, 100);

    listingManager.on('actions', onActionsEvent);

    function onActionsEvent (actions) {
        if (actions.create.length + listingManager.listings.length >= listingManager.cap || (actions.create.length === 0 && actions.remove.length === 0)) {
            clearInterval(interval);
            listingManager.removeListener('actions', onActionsEvent);
            callback();
        }
    }
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
