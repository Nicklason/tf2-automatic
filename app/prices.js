const TF2Prices = require('tf2-prices');
const fs = require('fs');

const Offer = require('./offer.js');
const utils = require('./utils.js');

let Automatic, log, config, Prices, Backpack, Items, Inventory;

let _wait;

const PRICES_FILENAME = 'prices.json';

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    Backpack = automatic.backpack;
    Items = automatic.items;
    Inventory = automatic.inventory;
};

exports.list = list;
exports.key = key;
exports.getPrice = function(name) { return Prices.getPrice(name); }

exports.handleBuyOrders = handleBuyOrders;
exports.handleSellOrders = handleSellOrders;

function key() {
    return Prices.currencies.keys.price.value;
}

function handleBuyOrders(offer) {
    const their = offer.items.their;
    const items = Items.getItems(their);
    const summary = Items.summary(items);
    for (const name in summary) {
        const amount = summary[name];

        const price = getPrice(name, true); // true because it is our item, we are selling it.
        if (price != null) {
            const limit = config.getLimit(name);
            const inInv = Inventory.getAmount(name);
            if (limit != -1 && amount + inInv > limit) {
                offer.log("info", "item will be, or is already overstocked (" + inInv + "/" + limit + ") (" + name + "), skipping");
                offer.logDetails("info");
                return false;
            }

            if (price.keys) {
                offer.currencies.their.metal = utils.addRefined(offer.currencies.their.metal, key(), price.keys * amount);
            }
            if (price.metal) {
                offer.currencies.their.metal = utils.addRefined(offer.currencies.their.metal, price.metal, amount);
            }
        }
    }
}

function handleSellOrders(offer) {
    const our = offer.items.our;
    const items = Items.getItems(our);
    const summary = Items.summary(items);
    for (const name in summary) {
        const amount = summary[name];

        let price = getPrice(name, true); // true because it is our item, we are selling it.
        if (price != null) {
            if (price.keys) {
                offer.currencies.our.metal = utils.addRefined(offer.currencies.our.metal, key(), price.keys * amount);
            }
            if (price.metal) {
                offer.currencies.our.metal = utils.addRefined(offer.currencies.our.metal, price.metal, amount);
            }
        } else {
            offer.log("info", "contains an item that is not in the pricelist (" + name + "), skipping");
            offer.logDetails("info");
            return false;
        }
    }
}

function getPrice(name, our) {
    if (name == "Scrap Metal") {
        return { metal: 0.11 };
    } else if (name == "Reclaimed Metal") {
        return { metal: 0.33 };
    } else if (name == "Refined Metal") {
        return { metal: 1 };
    }

    const priceObj = Prices.getPrice(name);
    if (priceObj == null) {
        return null;
    }
    return priceObj.price[our ? "sell" : "buy"];
}

function list() {
    return Prices.prices;
}

exports.init = function (callback) {
    Prices = new TF2Prices({ apiKey: config.get().pricesKey, pollTime: 5 * 60 * 1000 });

    if (fs.existsSync(PRICES_FILENAME)) {
        const pricelist = utils.parseJSON(fs.readFileSync(PRICES_FILENAME));
        if (pricelist != null) {
            Prices.setPrices(pricelist);
        }
    }

    log.debug('Initializing tf2-prices package.');
    Prices.init(callback);

    Prices.on('prices', pricesRefreshed);
    Prices.on('price', priceChanged);
};

function priceChanged(state, item, price) {
    switch (state) {
        case 1:
            log.info("\"" + item.name + "\" has been added to the pricelist");
            break;
        case 2:
            log.info("Price changed for \"" + item.name + "\"");
            break;
        case 3:
            log.info("\"" + item.name + "\" is no longer in the pricelist");
            break;
    }

    // Always create a listing for an item if it is new / updated
    if (state == 1) {
        const limit = config.getLimit(item.name);
        const inInv = Inventory.getAmount(item.name);
        if (!(limit != -1 && inInv >= limit)) {
            Backpack.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: Backpack.listingComment(0, item.name, price.buy)
            });
        }
    } else if (state == 2) {
        const limit = config.getLimit(item.name);
        const inInv = Inventory.getAmount(item.name);
        if (limit != -1 && limit > inInv) {
            Backpack.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: Backpack.listingComment(0, item.name, price.buy)
            }, true);
            Backpack.updateSellOrders(item.name, price);
        }
    } else {
        let listing = Backpack.findBuyOrder(item.name);
        if (listing) {
            Backpack.removeListing(listing.id);
        }
        Backpack.removeSellOrders(item.name);
    }
}

function pricesRefreshed(pricelist) {
    log.debug('Pricelist has been refreshed.');
    fs.writeFile(PRICES_FILENAME, JSON.stringify(pricelist), function(err) {
        if (err) {
            log.warn("Error writing price data: " + err);
        }
    });
}