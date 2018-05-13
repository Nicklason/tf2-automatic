const TF2Prices = require('tf2-prices');
const fs = require('graceful-fs');

const utils = require('./utils.js');

let Automatic, log, config, Prices, Backpack, Items, Inventory;

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

exports.init = function (callback) {
    Prices = new TF2Prices({ apiKey: config.get().pricesKey, pollTime: 5 * 60 * 1000 });

    if (fs.existsSync(PRICES_FILENAME)) {
        const pricelist = utils.parseJSON(fs.readFileSync(PRICES_FILENAME));
        if (pricelist != null) {
            Prices.setPrices(pricelist);
        }
    }

    log.debug('Initializing tf2-prices package.');
    Prices.init(function(err) {
        if (err) {
            callback(new Error('tf2-prices (' + err.message + ')'));
            return;
        }
        callback(null);
    });

    Prices.on('prices', pricesRefreshed);
    Prices.on('price', priceChanged);
};

exports.list = list;
exports.key = key;
exports.getPrice = function (name) { return Prices.getPrice(name); };

exports.findMatch = findMatch;

exports.handleBuyOrders = handleBuyOrders;
exports.handleSellOrders = handleSellOrders;

exports.addItems = function (items, callback) { Prices.addItems(items, callback); };
exports.removeItems = function (items, callback) { Prices.removeItems(items, callback); };

exports.update = function (callback) { Prices._fetchPrices(callback); };

exports.required = getRequired;
exports.value = getValue;
exports.afford = canAfford;

exports.valueToPure = valueToPure;

// Todo: Have the getPrice function take an amount

function getPrice(name, our) {
    if (name == 'Scrap Metal') {
        return { metal: 0.11 };
    } else if (name == 'Reclaimed Metal') {
        return { metal: 0.33 };
    } else if (name == 'Refined Metal') {
        return { metal: 1 };
    }

    let price = Prices.getPrice(name);
    if (price == null) return null;
    price = price.price;

    const intent = our == true ? 'sell' : 'buy';
    return price[intent];
}

function getRequired (price, amount, useKeys) {
    const keyValue = utils.refinedToScrap(key());

    const value = utils.refinedToScrap(price.metal) * amount + keyValue * price.keys * amount;

    const keys = useKeys ? Math.floor(value / keyValue) : 0;
    const metal = utils.scrapToRefined(value - keys * keyValue);

    return {
        keys,
        metal
    };
}

function getValue (currencies) {
    let value = 0;
    if (currencies.keys) {
        value += utils.refinedToScrap(key()) * currencies.keys;
    }
    if (currencies.metal) {
        value += utils.refinedToScrap(currencies.metal);
    }
    return value;
}

function pureValue(pure) {
    let value = 0;

    const summary = Items.createSummary(pure);

    value += utils.refinedToScrap(key()) * summary.keys;
    value += 9 * summary.refined;
    value += 3 * summary.reclaimed;
    value += summary.scrap;

    return value;
}

function canAfford(price, pure) {
    const priceVal = getValue(price);
    const pureVal = pureValue(pure);

    const amount = Math.floor(pureVal / priceVal);
    return amount;
}

function valueToPure(value, useKeys = true, onlyRef = false) {
    const keyValue = utils.refinedToScrap(key());

    const keys = useKeys ? Math.floor(value / keyValue) : 0;

    if (onlyRef) {
        const refined = utils.scrapToRefined(value - keys * keyValue);
        return {
            keys: keys,
            metal: refined
        };
    }

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

function handleBuyOrders(offer) {
    const their = offer.items.their;
    const dict = Items.createDictionary(their);
    const summary = Items.createSummary(dict);
    for (let name in summary) {
        const amount = summary[name];

        const price = getPrice(name, false);
        if (price == null) return false;

        const value = getValue(price) * amount;
        offer.currencies.their.metal += value;

        offer.prices.push({
            intent: 0,
            ids: dict[name],
            name: name,
            currencies: price
        });
    }
}

function handleSellOrders(offer) {
    const our = offer.items.our;
    const dict = Items.createDictionary(our);
    const summary = Items.createSummary(dict);
    for (let name in summary) {
        const amount = summary[name];

        const price = getPrice(name, true);
        if (price == null) return false;

        const value = getValue(price) * amount;
        offer.currencies.our.metal += value;

        offer.prices.push({
            intent: 1,
            ids: dict[name],
            name: name,
            currencies: price
        });
    }
}

function priceChanged(state, item, price) {
    switch (state) {
        case 1:
            log.info('"' + item.name + '" has been added to the pricelist');
            Automatic.alert('price', '"' + item.name + '" has been added to the pricelist. I am buying it for ' + utils.currencyAsText(price.buy) + ' and selling for ' + utils.currencyAsText(price.sell) + '.');
            break;
        case 2:
            log.info('Price changed for "' + item.name + '"');
            Automatic.alert('price', 'Price changed for "' + item.name + '". I am now buying for ' + utils.currencyAsText(price.buy) + ' and selling for ' + utils.currencyAsText(price.sell) + '.');
            break;
        case 3:
            log.info('"' + item.name + '" is no longer in the pricelist');
            Automatic.alert('price', '"' + item.name + '" is no longer in the pricelist');
            break;
    }

    if (state == 1 || state == 2) {
        const limit = config.limit(item.name);
        const inInv = Inventory.amount(item.name);
        if (!(limit != -1 && inInv >= limit)) {
            log.debug('"' + item.name + '" is not overstocked, will update buy order.');
            Backpack.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: Backpack.listingComment(0, item.name, price.buy)
            }, true);
        }
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
            log.warn('Error writing price data: ' + err);
        }
    });
}

function key() { return Prices.currencies.keys.price.value; }
function list() { return Prices.prices; }

function findMatch(search) {
    search = search.toLowerCase();
    let match = [];

    const pricelist = list();
    for (let i = 0; i < pricelist.length; i++) {
        const price = pricelist[i];
        const name = price.item.name;
        if (name.toLowerCase() == search) return price;
        if (name.toLowerCase().indexOf(search) != -1) match.push(price);
    }

    if (match.length == 0) return null;
    if (match.length == 1) return match[0];

    for (let i = 0; i < match.length; i++) match[i] = match[i].item.name;

    match.sort(function (a, b) {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    });

    return match;
}
