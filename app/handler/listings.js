const prices = require('app/prices');
const inventory = require('app/inventory');
const listingManager = require('lib/bptf-listings');

const templates = {
    buy: process.env.BPTF_DETAILS_BUY || 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
    sell: process.env.BPTF_DETAILS_SELL || 'I am selling my %name% for %price%, I have %current_stock%.'
};

exports.checkBySKU = function (sku, data) {
    const match = data === undefined ? prices.get(sku) : data;

    let hasBuyListing = false;
    let hasSellListing = false;

    listingManager.findListings(sku).forEach((listing) => {
        if (match === null || match.intent !== 2 && match.intent !== listing.intent || match.enabled === false) {
            listing.remove();
        } else {
            if (listing.intent === 0) {
                hasBuyListing = true;
            } else if (listing.intent === 1) {
                hasSellListing = true;
            }

            const intent = match[listing.intent === 0 ? 'buy' : 'sell'];
            const currencies = match[intent];
            listing.update({
                details: getDetails(listing.intent, match),
                currencies: currencies
            });
        }
    });

    if (match !== null && match.enabled === true) {
        const items = inventory.findBySKU(sku);

        if (!hasBuyListing && (match.intent === 0 || match.intent === 2) && !inventory.isOverstocked(sku)) {
            listingManager.createListing({
                sku: sku,
                intent: 0,
                details: getDetails(0, match),
                currencies: match.buy
            });
        }

        if (!hasSellListing && (match.intent === 1 || match.intent === 2) && items.length - items.min > 0) {
            listingManager.createListing({
                sku: items[0],
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
        .replace(/%current_stock%/g, pricelistEntry.max - pricelistEntry.min)
        .replace(/%max_stock%/g, inventory.getAmount(pricelistEntry.sku));

    return details;
}
