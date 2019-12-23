const TradeOfferManager = require('steam-tradeoffer-manager');
const Currencies = require('tf2-currencies');

const log = require('lib/logger');
const inventory = require('app/inventory');
const prices = require('app/prices');
const listings = require('handler/listings');

const isAdmin = require('utils/isAdmin');
const checkBanned = require('utils/isBanned');

exports.newOffer = function (offer, done) {
    offer.log('info', 'is being processed...');

    const keyPrices = prices.getKeyPrices();

    const items = {
        our: inventory.createDictionary(offer.itemsToGive),
        their: inventory.createDictionary(offer.itemsToReceive)
    };


    // Use itemsDiff variable for checking stock limits

    const exchange = {
        contains: { items: false, metal: false, keys: false },
        our: { value: 0, keys: 0, scrap: 0, contains: { items: false, metal: false, keys: false } },
        their: { value: 0, keys: 0, scrap: 0, contains: { items: false, metal: false, keys: false } }
    };

    const itemsDiff = {};
    const itemsDict = { our: {}, their: {} };

    const states = [false, true];

    for (let i = 0; i < states.length; i++) {
        const buying = states[i];
        const which = buying ? 'their' : 'our';

        for (const sku in items[which]) {
            if (!Object.prototype.hasOwnProperty.call(items[which], sku)) {
                continue;
            }

            if (sku === 'unknown') {
                // Offer contains an item that is not from TF2
                offer.log('contains items not from TF2, declining...');
                return done('decline', 'INVALID_ITEMS');
            }

            if (sku === '5000;6') {
                exchange.contains.metal = true;
                exchange[which].contains.metal = true;
            } else if (sku === '5001;6') {
                exchange.contains.metal = true;
                exchange[which].contains.metal = true;
            } else if (sku === '5002;6') {
                exchange.contains.metal = true;
                exchange[which].contains.metal = true;
            } else if (sku === '5021;6') {
                exchange.contains.keys = true;
                exchange[which].contains.keys = true;
            } else {
                exchange.contains.items = true;
                exchange[which].contains.items = true;
            }

            const amount = items[which][sku].length;

            itemsDiff[sku] = (itemsDiff[sku] || 0) + amount * (buying ? 1 : -1);
            itemsDict[which][sku] = amount;
        }
    }

    offer.data('diff', itemsDiff);
    offer.data('dict', itemsDict);

    // Check if the offer is from an admin
    if (isAdmin(offer.partner)) {
        offer.log('info', 'is from an admin, accepting. Summary:\n' + offer.summarize());
        done('accept', 'ADMIN');
        return;
    }

    if (process.env.ACCEPT_GIFT === 'true' && offer.itemsToGive.length === 0 && ['donate', 'gift'].indexOf(offer.message.toLowerCase()) !== -1) {
        offer.log('info', 'is a gift offer, accepting. Summary:\n' + offer.summarize());
        done('accept', 'GIFT');
        return;
    } else if (offer.itemsToReceive.length === 0 || offer.itemsToGive.length === 0) {
        offer.log('info', 'is a gift offer, declining...');
        done('decline', 'GIFT');
        return;
    }

    for (let i = 0; i < states.length; i++) {
        const buying = states[i];
        const which = buying ? 'their' : 'our';
        const intentString = buying ? 'buy' : 'sell';

        for (const sku in items[which]) {
            if (!Object.prototype.hasOwnProperty.call(items[which], sku)) {
                continue;
            }

            const assetids = items[which][sku];
            const amount = assetids.length;

            if (sku === '5000;6') {
                exchange[which].value += amount;
                exchange[which].scrap += amount;
            } else if (sku === '5001;6') {
                const value = 3 * amount;
                exchange[which].value += value;
                exchange[which].scrap += value;
            } else if (sku === '5002;6') {
                const value = 9 * amount;
                exchange[which].value += value;
                exchange[which].scrap += value;
            } else {
                const match = prices.get(sku, true);

                // TODO: Go through all assetids and check if the item is being sold for a specific price

                if (match !== null) {
                    // Add value of items
                    exchange[which].value += match[intentString].toValue(keyPrices[intentString].metal) * amount;
                    exchange[which].scrap += Currencies.toScrap(match[intentString].metal) * amount;

                    if (sku !== '5021;6') {
                        exchange[which].keys += match[intentString].keys * amount;
                    }
                }

                if (sku === '5021;6') {
                    // Offer contains keys
                    if (match === null) {
                        // We are not trading keys, add value anyway
                        exchange[which].value += keyPrices[intentString].toValue() * amount;
                        exchange[which].keys += amount;
                    }
                } else if (match === null || match.intent === buying ? 1 : 0) {
                    // Offer contains an item that we are not trading
                    return done('decline', 'INVALID_ITEMS');
                } else {
                    // Check stock limits (not for keys)
                    const diff = itemsDiff[sku];
                    if (inventory.amountCanTrade(sku, buying) - diff < 0) {
                        // User is taking too many / offering too many
                        offer.log('info', 'is taking / offering too many, declining...');
                        return done('decline', 'OVERSTOCKED');
                    }
                }
            }
        }
    }

    offer.data('value', {
        our: {
            keys: exchange.our.keys,
            metal: Currencies.toRefined(exchange.our.scrap)
        },
        their: {
            keys: exchange.their.keys,
            metal: Currencies.toRefined(exchange.their.scrap)
        },
        rates: {
            buy: keyPrices.buy.metal,
            sell: keyPrices.sell.metal
        }
    });

    if (exchange.contains.metal && !exchange.contains.keys && !exchange.contains.items) {
        // Offer only contains metal
        offer.log('info', 'only contains metal, declining...');
        return done('decline', 'ONLY_METAL');
    } else if (exchange.contains.keys && !exchange.contains.items) {
        // Offer is for trading keys, check if we are trading them
        const priceEntry = prices.get('5021;6', true);
        if (priceEntry === null) {
            // We are not trading keys
            offer.log('info', 'we are not trading keys, declining...');
            return done('decline', 'NOT_TRADING_KEYS');
        } else if (exchange.our.contains.keys && (priceEntry.intent !== 1 && priceEntry.intent !== 2)) {
            // We are not selling keys
            offer.log('info', 'we are not selling keys, declining...');
            return done('decline', 'NOT_TRADING_KEYS');
        } else if (exchange.their.contains.keys && (priceEntry.intent !== 0 && priceEntry.intent !== 2)) {
            // We are not buying keys
            offer.log('info', 'we are not buying keys, declining...');
            return done('decline', 'NOT_TRADING_KEYS');
        } else {
            // Check overstock / understock on keys
            const diff = itemsDiff['5021;6'];
            // If the diff is greater than 0 then we are buying, less than is selling
            if (diff !== 0 && inventory.amountCanTrade('5021;6', diff > 0) - diff < 0) {
                // User is taking too many / offering too many
                offer.log('info', 'is taking / offering too many keys, declining...');
                return done('decline', 'OVERSTOCKED');
            }
        }
    }

    // Check if the value is correct

    if (exchange.our.value > exchange.their.value) {
        // We are offering more than them, decline the offer
        offer.log('info', 'is not offering enough, declining...');
        return done('decline', 'INVALID_VALUE');
    }

    // TODO: If we are receiving items, mark them as pending and use it to check overstock / understock for new offers

    offer.log('info', 'checking escrow...');

    checkEscrow(offer, function (err, hasEscrow) {
        if (err) {
            log.warn('Failed to check escrow', err);
            return done();
        }

        if (hasEscrow) {
            offer.log('info', 'would be held if accepted, declining...');
            return done('decline', 'ESCROW');
        }

        offer.log('info', 'checking bans...');

        checkBanned(offer.partner.getSteamID64(), function (err, isBanned) {
            if (err) {
                log.warn('Failed to check banned', err);
                return done();
            }

            if (isBanned) {
                offer.log('info', 'partner is banned in one or more communities, declining...');
                return done('decline', 'BANNED');
            }

            offer.log('trade', 'accepting. Summary:\n' + offer.summarize());

            return done('accept', 'VALID_OFFER');
        });
    });
};

// TODO: Add error handling
function checkEscrow (offer, callback) {
    if (process.env.ACCEPT_ESCROW === 'true') {
        return callback(null, false);
    }

    offer.getUserDetails(function (err, me, them) {
        if (err) {
            return callback(err);
        }

        return callback(null, them.escrowDays !== 0);
    });
}

exports.offerChanged = function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
        // Offer is accepted, go through items diff and check listings for all of them

        const diff = offer.data('diff') || {};

        for (const sku in diff) {
            if (!Object.prototype.hasOwnProperty.call(diff, sku)) {
                continue;
            }

            listings.checkBySKU(sku);
        }
    }
};
