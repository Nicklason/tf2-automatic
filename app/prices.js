const async = require('async');
const SKU = require('tf2-sku');
const Currencies = require('tf2-currencies');

const log = require('lib/logger');
const api = require('lib/ptf-api');
const validator = require('lib/validator');
const schemaManager = require('lib/tf2-schema');
const socket = require('lib/ptf-socket');

const handlerManager = require('app/handler-manager');

let pricelist = [];
let keyPrices = null;
const handling = [];

exports.init = function (callback) {
    socket.removeListener('price', handlePriceChange);
    socket.on('price', handlePriceChange);

    const funcs = {
        keys: function (callback) {
            api.getPrice('5021;6', 'bptf', callback);
        }
    };

    if (pricelist.length !== 0) {
        funcs.pricelist = function (callback) {
            api.getPricelist('bptf', callback);
        };
    }

    async.parallel(funcs, function (err, result) {
        if (err) {
            return callback(err);
        }

        keyPrices = {
            buy: new Currencies(result.keys.buy),
            sell: new Currencies(result.keys.sell)
        };

        if (pricelist.length === 0) {
            return callback(null);
        }

        const prices = result.pricelist.items;

        const handler = handlerManager.getHandler();

        let pricesChanged = false;

        // Go through our pricelist
        for (let i = 0; i < pricelist.length; i++) {
            if (pricelist[i].autoprice !== true) {
                continue;
            }

            // Go through pricestf prices
            for (let j = 0; j < prices.length; j++) {
                if (prices[j].buy === null) {
                    prices.splice(j, 1);
                    break;
                }

                if (pricelist[i].name === prices[j].name) {
                    // Found matching items
                    if (pricelist[i].time < prices[j].time) {
                        // Times don't match, update our price
                        pricelist[i].buy = new Currencies(prices[j].buy);
                        pricelist[i].sell = new Currencies(prices[j].sell);
                        pricelist[i].time = prices[j].time;

                        pricesChanged = true;
                    }

                    // When a match is found remove it from the ptf pricelist
                    prices.splice(j, 1);
                    break;
                }
            }
        }

        // We can afford to go through pricelist.length * prices.length because we will only do this once on startup

        if (pricesChanged) {
            // Our pricelist changed, emit it
            handler.onPricelist(pricelist);
        }

        callback(null);
    });
};

/**
 * Returns how many of an item you can afford
 * @param {Boolean} buying If we are buying or not (used for key prices)
 * @param {Boolean} useKeys
 * @param {Object} currencies Currencies object containing keys and metal value
 * @param {Object} currenciesDict Object containing all pure available
 * @return {Number}
 */
exports.amountCanAfford = function (buying, useKeys, currencies, currenciesDict) {
    const keyPrice = exports.getKeyPrices()[buying ? 'buy' : 'sell'];

    const value = currencies.toValue(keyPrice.metal);

    let totalValue = 0;

    for (const sku in currenciesDict) {
        if (!Object.prototype.hasOwnProperty.call(currenciesDict, sku)) {
            continue;
        }

        const amount = Array.isArray(currenciesDict[sku]) ? currenciesDict[sku].length : currenciesDict[sku];

        if (useKeys && sku === '5021;6') {
            totalValue += keyPrice.toValue() * amount;
        } else if (sku === '5002;6') {
            totalValue += 9 * amount;
        } else if (sku === '5001;6') {
            totalValue += 3 * amount;
        } else if (sku === '5000;6') {
            totalValue += amount;
        }
    }

    return Math.floor(totalValue / value);
};

exports.setPricelist = function (prices) {
    if (!Array.isArray(prices)) {
        throw new Error('Pricelist is not an array');
    }

    for (let i = 0; i < prices.length; i++) {
        const entry = prices[i];

        const errors = validator(entry, 'pricelist');
        if (errors !== null) {
            throw new Error('Invalid pricelist item: ' + errors.join(', '));
        }

        entry.buy = new Currencies(entry.buy);
        entry.sell = new Currencies(entry.sell);
    }

    pricelist = prices;
};

exports.getPricelist = function () {
    return pricelist;
};

exports.getKeyPrices = function () {
    return keyPrices;
};

function handlePriceChange (data) {
    if (data.source === 'bptf') {
        if (data.sku === '5021;6') {
            // Update key prices
            keyPrices.buy = new Currencies(data.buy);
            keyPrices.sell = new Currencies(data.sell);
        }

        const match = exports.get(data.sku);
        if (match !== null && match.autoprice === true) {
            log.debug('Price of ' + match.name + ' (' + match.sku + ') changed');

            // Update prices
            match.buy = new Currencies(data.buy);
            match.sell = new Currencies(data.sell);
            match.time = data.time;

            // Emit price change for sku (maybe include old price / new price?)
            handlerManager.getHandler().onPriceChange(match.sku, match);
        }
    }
}

/**
 * Searches for names in the pricelist that match the search
 * @param {String} search
 * @param {Boolean} [enabledOnly=true]
 * @return {null|Object|Array<String>}
 */
exports.searchByName = function (search, enabledOnly = true) {
    search = search.toLowerCase();

    const match = [];

    const pricelist = exports.getPricelist();

    for (let i = 0; i < pricelist.length; i++) {
        const entry = pricelist[i];

        if (enabledOnly && entry.enabled === false) {
            continue;
        }

        const name = entry.name.toLowerCase();

        if (search === name) {
            // Found direct match
            return entry;
        }

        if (name.indexOf(search) !== -1) {
            match.push(entry);
        }
    }

    if (match.length === 0) {
        // No match
        return null;
    } else if (match.length === 1) {
        // Found one that matched the search
        return match[0];
    }

    // Found many that matched, return list of the names
    return match.map((entry) => entry.name);
};

exports.get = function (sku, onlyEnabled = false) {
    const name = schemaManager.schema.getName(SKU.fromString(sku));
    const match = pricelist.find((v) => v.name === name);

    return match === undefined || (onlyEnabled && match.enabled !== true) ? null : match;
};

exports.add = function (sku, data, callback) {
    if (sku === undefined) {
        callback(new Error('Missing sku'));
        return;
    } else if (sku === '0;0') {
        callback(new Error('Invalid item'));
        return;
    }

    log.debug('Handling request to add item to pricelist', { sku: sku, data: data });

    const match = exports.get(sku);

    if (match !== null) {
        callback(new Error('Item is already in the pricelist'));
        return;
    } else if (handling.indexOf(sku) !== -1) {
        callback(new Error('Item is already being changed'));
        return;
    }

    const item = SKU.fromString(sku);

    if (item.defindex === 0 || item.quality === 0) {
        callback(new Error('Unknown item'));
        return;
    }

    const entry = Object.assign(data, {
        sku: sku,
        name: schemaManager.schema.getName(SKU.fromString(sku))
    });

    // Validate data object
    const errors = validator(entry, 'add');
    if (errors !== null) {
        return callback(new Error(errors.join(', ')));
    }

    if (entry.autoprice !== true) {
        entry.time = null;

        const errors = validator(entry, 'pricelist');
        if (errors !== null) {
            return callback(new Error(errors.join(', ')));
        }

        const keyPrice = exports.getKeyPrices()['sell'].metal;

        const buy = new Currencies(entry.buy);
        const sell = new Currencies(entry.sell);

        if (buy.toValue(keyPrice) >= sell.toValue(keyPrice)) {
            return callback(new Error('Sell must be higher than buy'));
        }

        add(entry, true);
        return callback(null, entry);
    }

    handling.push(sku);

    log.debug('Item is being autopriced, getting price...');

    // TODO: If the item is not in the pricestf pricelist then request a check
    api.getPrice(sku, 'bptf', function (err, prices) {
        handling.splice(handling.indexOf(sku), 1);
        if (err) {
            return callback(err);
        }

        if (prices.buy === null) {
            return callback(new Error('Item has no buy price on pricestf'));
        }

        entry.buy = prices.buy;
        entry.sell = prices.sell;
        entry.time = prices.time;

        add(entry, true);
        return callback(null, entry);
    });
};

function add (entry, emit) {
    log.debug('Adding item to pricelist', { entry: entry });

    const errors = validator(entry, 'pricelist');

    if (errors !== null) {
        throw new Error(errors.join(', '));
    }

    entry.buy = new Currencies(entry.buy);
    entry.sell = new Currencies(entry.sell);

    pricelist.push(entry);

    if (emit === true) {
        const handler = handlerManager.getHandler();
        // Price of item changed
        handler.onPriceChange(entry.sku, entry);
        // Pricelist updated
        handler.onPricelist(pricelist);
    }
}

exports.update = function (sku, data, callback) {
    const match = exports.get(sku, false);

    if (match === null) {
        callback(new Error('Item is not in the pricelist'));
        return;
    } else if (handling.indexOf(match.sku) !== -1) {
        callback(new Error('Item is already being changed'));
        return;
    }

    const copy = Object.assign({}, match);

    copy.buy = copy.buy.toJSON();
    copy.sell = copy.sell.toJSON();

    for (const property in data) {
        if (!Object.prototype.hasOwnProperty.call(data, property)) {
            continue;
        }

        copy[property] = data[property];
    }

    const time = copy.time;
    delete copy.time;
    const errors = validator(copy, 'add');

    if (errors !== null) {
        return callback(new Error(errors.join(', ')));
    }

    if (copy.max !== -1 && copy.max <= copy.min) {
        return callback(new Error('Max needs to be more than min'));
    }

    copy.time = time;

    if (copy.autoprice === false) {
        const keyPrice = exports.getKeyPrices()['sell'].metal;

        const buy = new Currencies(copy.buy);
        const sell = new Currencies(copy.sell);

        if (buy.toValue(keyPrice) >= sell.toValue(keyPrice)) {
            return callback(new Error('Sell must be higher than buy'));
        }

        copy.time = null;
        remove(copy.sku, false);
        add(copy, true);
        return callback(null, copy);
    } else if (copy.autoprice === match.autoprice) {
        remove(copy.sku, false);
        add(copy, true);
        return callback(null, copy);
    }

    handling.push(match.sku);

    // TODO: If the item is not in the pricestf pricelist then request a check
    api.getPrice(match.sku, 'bptf', function (err, prices) {
        handling.splice(handling.indexOf(match.sku), 1);
        if (err) {
            return callback(err);
        }

        if (prices.buy === null) {
            return callback(new Error('Item has no buy price on pricestf'));
        }

        copy.buy = prices.buy;
        copy.sell = prices.sell;
        copy.time = prices.time;

        remove(copy.sku, false);
        add(copy, true);
        return callback(null, copy);
    });
};

exports.remove = function (sku, callback) {
    const match = remove(sku, true);

    if (match === null) {
        return callback(new Error('Item is not in the pricelist'));
    }

    return callback(null, match);
};

function remove (sku, emit) {
    let index = -1;
    for (let i = 0; i < pricelist.length; i++) {
        if (pricelist[i].sku === sku) {
            index = i;
            break;
        }
    }

    if (index === -1) {
        return null;
    }

    const match = pricelist[index];
    pricelist.splice(index, 1);

    if (emit === true) {
        const handler = handlerManager.getHandler();
        // Price of item changed
        handler.onPriceChange(sku, null);
        // Pricelist updated
        handler.onPricelist(pricelist);
    }

    return match;
}
