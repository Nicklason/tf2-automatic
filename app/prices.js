const TF2Prices = require('tf2-prices');
const fs = require('graceful-fs');

const Offer = require('./offer.js');
const utils = require('./utils.js');

let Automatic, log, config, Prices, Backpack, Items, Inventory;

let _wait;

const FOLDER_NAME = 'temp';
const PRICES_FILENAME = FOLDER_NAME + '/prices.json';

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
exports.getPrice = function (name) { return Prices.getPrice(name); }

exports.findMatch = findMatch;

exports.handleBuyOrders = handleBuyOrders;
exports.handleSellOrders = handleSellOrders;

exports.addItems = function (items, callback) { Prices.addItems(items, callback); }
exports.removeItems = function (items, callback) { Prices.removeItems(items, callback); }

exports.update = function (callback) { Prices._fetchPrices(callback); }

exports.calculatePrice = calculatePrice;
exports.canAfford = canAfford;

exports.valueToPure = valueToPure;

// Multiply price object by an amount;
function calculatePrice(price, amount, useKeys) {
    const keyValue = utils.refinedToScrap(key());
    // Total value
    const value = utils.refinedToScrap(price.metal) * amount + keyValue * price.keys * amount;
    // In keys and ref
    const keys = useKeys ? Math.floor(value / keyValue) : 0;
    const refined = utils.scrapToRefined(value - keys * keyValue);

    return {
        value: value,
        metal: refined,
        keys: keys
    };
};

function canAfford(price, pure) {
    const amount = Math.floor(pure / price);
    return amount;
}

function valueToPure(value, useKeys) {
    const keyValue = utils.refinedToScrap(key());

    const keys = useKeys ? Math.floor(value / keyValue) : 0;
    const refined = Math.floor((value - keys * keyValue) / 9);
    const reclaimed = Math.floor((value - refined * 9 - keys * keyValue) / 3);
    const scrap = value - refined * 9 - reclaimed * 3 - keys * keyValue;

    return {
        keys: keys,
        refined: refined,
        reclaimed: reclaimed,
        scrap: scrap
    };
}

/*
function canAfford(pure, price) {
    const keyValue = utils.refinedToScrap(key());
    const value = pure.keys * keyValue + utils.refinedToScrap(pure.metal);

    if (value < price) {
        // Buyer can't afford the item, we will 
    }

    return value >= price;
}
*/

function findMatch(search) {
    search = search.toLowerCase();

    let match = [];
    const pricelist = list();
    for (let i = 0; i < pricelist.length; i++) {
        const priceObj = pricelist[i];
        const name = priceObj.item.name;
        if (name.toLowerCase() == search) {
            return priceObj;
        } else if (name.toLowerCase().indexOf(search) != -1) {
            match.push(priceObj);
        }
    }

    if (match.length == 0) {
        return null;
    } else if (match.length == 1) {
        return match[0];
    }

    for (let i = 0; i < match.length; i++) {
        const name = match[i].item.name;
        match[i] = name;
    }

    match.sort(function(a, b){
        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    });

    return match;
}

function key() {
    return Prices.currencies.keys.price.value;
}

// Get price of their items.
function handleBuyOrders(offer) {
    const their = offer.items.their;
    const items = Items.getItems(their);
    const summary = Items.summary(items);
    for (const name in summary) {
        const amount = summary[name];

        const price = getPrice(name, false); // false because it is their item, we are buying it.
        if (price != null) {
            const limit = config.getLimit(name);
            const inInv = Inventory.getAmount(name);
            if (limit != -1 && amount + inInv > limit) {
                offer.log("trade", "\"" + name + "\" will be, or is already overstocked (I have " + inInv + "/" + limit + "), declining. Summary:\n" + offer.summary());
                Automatic.alert("trade", "\"" + name + "\" will be, or is already overstocked (I have " + inInv + "/" + limit + "), declining. Summary:\n" + offer.summary());
                Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You offered an item that will be, or is already overstocked" });

                offer.decline().then(function () {
                    offer.log("debug", "declined");
                });
                return false;
            }

            if (price.keys) {
                offer.currencies.their.metal = utils.addRefined(offer.currencies.their.metal, key(), price.keys * amount);
            }
            if (price.metal) {
                offer.currencies.their.metal = utils.addRefined(offer.currencies.their.metal, price.metal, amount);
            }
        } else {
            offer.log("trade", "\"" + name + "\" is not in the pricelist, declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "\"" + name + "\" is not in the pricelist, declining. Summary:\n" + offer.summary());
            Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You offered an item that is not in my pricelist" });

            offer.decline().then(function () {
                offer.log("debug", "declined");
            });
            return false;
        }
    }
}

// Get price of our items.
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
            offer.log("trade", "contains an item that is not in the pricelist (" + name + "), declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "Contains an item that is not in the pricelist (" + name + "), declining. Summary:\n" + offer.summary());
            Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You are taking an item that is not in my pricelist" });
            
            offer.decline().then(function () {
                offer.log("debug", "declined");
            });
            return false;
        }
    }
}

// If our is true, we will get the sell price, if not, then the buy price.
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
            Automatic.alert('price', "\"" + item.name + "\" has been added to the pricelist. I am buying it for " + utils.currencyAsText(price.buy) + " and selling for " + utils.currencyAsText(price.sell) + ".");
            break;
        case 2:
            log.info("Price changed for \"" + item.name + "\"");
            Automatic.alert('price', "Price changed for \"" + item.name + "\". I am now buying for " + utils.currencyAsText(price.buy) + " and selling for " + utils.currencyAsText(price.sell) + ".");
            break;
        case 3:
            log.info("\"" + item.name + "\" is no longer in the pricelist");
            Automatic.alert('price', "\"" + item.name + "\" is no longer in the pricelist");
            break;
    }

    if (state == 1 || state == 2) {
        const limit = config.getLimit(item.name);
        const inInv = Inventory.getAmount(item.name);
        // Checking if the item is not overstocked.
        if (!(limit != -1 && inInv >= limit)) {
            log.debug("\"" + item.name + "\" is not overstocked, will update buy order.");
            // Create a new listing for the item, and remove the listing if there already is one.
            Backpack.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: Backpack.listingComment(0, item.name, price.buy)
            }, true);
        }
        // Update sell orders for the item with new prices.
        Backpack.updateSellOrders(item.name, price);
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
    fs.writeFile(PRICES_FILENAME, JSON.stringify(pricelist), function (err) {
        if (err) {
            log.warn("Error writing price data: " + err);
        }
    });
}