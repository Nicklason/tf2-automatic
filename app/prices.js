const TF2Automatic = require('tf2automatic');
const isObject = require('isobject');
const fs = require('graceful-fs');

const utils = require('./utils.js');

let Automatic, log, config, API, Backpack, Items, Inventory;

const FOLDER_NAME = 'temp';
const LISTINGS_FILENAME = FOLDER_NAME + '/listings.json';

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    Backpack = automatic.backpack;
    Items = automatic.items;
    Inventory = automatic.inventory;

    API = new TF2Automatic({ client_id: config.get('client_id'), client_secret: config.get('client_secret'), pollTime: 5 * 60 * 1000 });
};

exports.init = function (callback) {
    if (fs.existsSync(LISTINGS_FILENAME)) {
        const pricelist = utils.parseJSON(fs.readFileSync(LISTINGS_FILENAME));
        if (pricelist != null) {
            API.listings = pricelist;
        }
    }

    log.debug('Initializing tf2automatic package.');
    API.init(function(err) {
        if (err) {
            callback(new Error('tf2automatic (' + err.message + ')'));
            return;
        }
        
        callback(null);
    });

    API.on('listings', pricesRefreshed);
    API.on('change', priceChanged);
    API.on('rate', rateEmitted);
};

exports.list = list;
exports.key = key;
exports.getPrice = function (name) {
    const listing = API.findListing(name);
    if (listing == null) {
        return null;
    }
    const item = API.getItem(listing);
    return {
        item: item,
        price: listing.prices
    };
};
exports.findListing = function (name) {
    return API.findListing(name);
};
exports.getItem = function (listing) {
    return API.getItem(listing);
};
exports.getLimit = function (name) {
    const listing = exports.findListing(name);
    if (listing == null || !isObject(listing.meta) || !listing.meta.hasOwnProperty('max_stock')) {
        return config.get('stocklimit');
    }

    return listing.meta.max_stock;
};

exports.findMatch = findMatch;

exports.handleBuyOrders = handleBuyOrders;
exports.handleSellOrders = handleSellOrders;

exports.addItem = function (items, callback) { API.addListing(items, callback); };
exports.removeItems = function (items, callback) { API.removeListings(items, callback); };
exports.removeAll = removeAll;
exports.updateItem = function (name, update, callback) { API.updateListing(name, update, callback); };

exports.required = getRequired;
exports.value = getValue;
exports.afford = canAfford;

exports.valueToPure = valueToPure;
exports.valueToCurrencies = valueToCurrencies;

function removeAll(callback) {
    let names = [];
    const listings = list();
    for (let i = 0; i < listings.length; i++) {
        const name = listings[i].name;
        names.push(name);
    }

    API.removeListings(names, callback);
}

function getPrice(name, our) {
    if (name == 'Scrap Metal') {
        return { metal: 0.11 };
    } else if (name == 'Reclaimed Metal') {
        return { metal: 0.33 };
    } else if (name == 'Refined Metal') {
        return { metal: 1 };
    }

    let price = exports.getPrice(name);
    if (price == null || price.price == null) return null;
    price = price.price;

    const intent = our == true ? 'sell' : 'buy';
    if (!price.hasOwnProperty(intent)) {
        return null;
    }
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

function valueToPure(value, useKeys = true) {
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

function valueToCurrencies(value, useKeys = true) {
    const pure = valueToPure(value, useKeys);

    const metal = utils.scrapToRefined(pure.refined * 9 + pure.reclaimed * 3 + pure.scrap);

    return {
        keys: pure.keys,
        metal: metal
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
            value: value
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
            value: value
        });
    }
}

function priceChanged(state, item, prices) {
    switch (state) {
        case 1:
            log.info('"' + item.name + '" has been added to the pricelist');
            Automatic.alert('price', '"' + item.name + '" has been added to the pricelist.');
            break;
        case 2:
            log.info('"' + item.name + '" has changed');
            Automatic.alert('price', '"' + item.name + '" has changed.');
            break;
        case 3:
            log.info('"' + item.name + '" is no longer in the pricelist');
            Automatic.alert('price', '"' + item.name + '" is no longer in the pricelist');
            break;
    }

    if ((state == 1 || state == 2) && prices != null) {
        const limit = exports.getLimit(item.name);
        const inInv = Inventory.amount(item.name);
        if (prices.buy) {
            if (!(limit != -1 && inInv >= limit)) {
                Backpack.createListing({
                    intent: 0,
                    item: item,
                    currencies: prices.buy,
                    details: Backpack.listingComment(0, item.name, prices.buy)
                }, true);
            } else {
                let order = Backpack.findBuyOrder(item.name);
                if (order) {
                    Backpack.removeListing(order.id);
                }
            }
        }
        if (prices.sell) {
            Backpack.updateSellOrders(item.name);
        }
    } else if (state == 3) {
        let order = Backpack.findBuyOrder(item.name);
        if (order) {
            Backpack.removeListing(order.id);
        }
        Backpack.removeSellOrders(item.name);
    }
}

function pricesRefreshed(pricelist) {
    log.debug('Pricelist has been refreshed.');
    fs.writeFile(LISTINGS_FILENAME, JSON.stringify(pricelist), function (err) {
        if (err) {
            log.warn('Error writing price data: ' + err);
        }
    });
}

function rateEmitted(rate) {
    log.debug(rate);
}

function key() { return API.currencies.keys.price.value; }
function list() { return API.listings; }

// Bunch of random checks, but it works better than just checking for items that contains the search strng
function findMatch(search) {
    search = search.toLowerCase();

    let match = [],
        max = 0,
        item = null,
        total = 0;

    const pricelist = list();
    for (let i = 0; i < pricelist.length; i++) {
        if (pricelist[i].prices == null) {
            continue;
        }
        const name = pricelist[i].name.toLowerCase();
        if (name == search) {
            return pricelist[i];
        }

        const similarity = utils.compareStrings(name, search);
        if (name.indexOf(search) == -1 && similarity <= 0.4) {
            continue;
        }

        if (similarity > max) {
            max = similarity;
            item = pricelist[i];
        }

        total += similarity;
        let push = pricelist[i];
        push.similarity = similarity;
        match.push(push);
    }

    if (match.length == 0) return null;

    const average = total / match.length;

    for (var i = match.length; i--;) {
        const name = match[i].name.toLowerCase();
        if (name.indexOf(search) == -1) {
            const similarity = utils.compareStrings(name, search);
            if (average * 0.8 > similarity) {
                match.splice(i, 1);
            }
        }
    }

    if (match.length == 1) {
        return match[0];
    }

    if (!(max * 0.8 < average || average * 1.2 > max)) {
        if (max > 0.8) {
            return item;
        } else if (0.2 > max) {
            return null;
        }
    }

    match.sort(function (a, b) {
        return b.similarity - a.similarity;
    });

    for (let i = 0; i < match.length; i++) match[i] = match[i].name;

    return match;
}
