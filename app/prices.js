const SKU = require('tf2-sku');
const Currencies = require('tf2-currencies');

const log = require('lib/logger');
const api = require('lib/ptf-api');
const socket = require('lib/ptf-socket');
const validator = require('lib/validator');
const schemaManager = require('lib/tf2-schema');

const handlerManager = require('app/handler-manager');

let pricelist = [];
const handling = [];

exports.init = function (callback) {
    socket.on('price', handlePriceChange);

    if (pricelist.length === 0) {
        callback(null);
        return;
    }

    api.getPricelist('bptf', function (err, prices) {
        if (err) {
            return callback(err);
        }

        const handler = handlerManager.getHandler();

        let pricesChanged = false;

        // Go through our pricelist
        for (let i = 0; i < pricelist.length; i++) {
            if (pricelist[i].autoprice !== true) {
                continue;
            }

            // Go through pricestf prices
            for (let j = 0; j < prices.length; j++) {
                if (pricelist[i].sku === prices[j].sku) {
                    // Found matching items
                    if (pricelist[i].autoprice === true && pricelist[i].time < prices[j].time) {
                        // Times don't match, update our price
                        pricelist[i].buy = new Currencies(prices[j].buy);
                        pricelist[i].sell = new Currencies(prices[j].sell);
                        pricelist[i].time = prices[j].time;

                        pricesChanged = true;

                        handler.onPriceChange(pricelist[i].sku);
                    }

                    // Remove item because it was checked
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

exports.setPricelist = function (v) {
    if (!Array.isArray(v)) {
        throw new Error('Pricelist is not an array');
    }

    for (let i = 0; i < v.length; i++) {
        const entry = v[i];

        const errors = validator(entry, 'pricelist');
        if (errors !== null) {
            throw new Error('Invalid pricelist item: ' + errors.join(', '));
        }

        entry.buy = new Currencies(entry.buy);
        entry.sell = new Currencies(entry.sell);
    }

    pricelist = v;
};

exports.getPricelist = function () {
    return pricelist;
};

function handlePriceChange (data) {
    if (data.source === 'bptf') {
        const match = exports.get(data.sku);
        if (match !== null && match.autoprice === true) {
            // Update prices
            match.buy = data.buy;
            match.sell = data.sell;
            match.time = data.time;

            // Emit price change for sku (maybe include old price / new price?)
            handlerManager.getHandler().onPriceChange(match.sku);
        }
    }
}

exports.get = function (identifier, isSKU = true) {
    const key = isSKU ? 'sku' : 'name';
    const match = pricelist.find((v) => v[key] === identifier);

    return match === undefined ? null : match;
};

exports.add = function (sku, data, callback) {
    if (sku === undefined) {
        callback(new Error('Missing sku'));
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

exports.update = function (identifier, isSKU, data, callback) {
    if (typeof isSKU === 'object') {
        callback = data;
        data = isSKU;
        isSKU = true;
    }

    const match = exports.get(identifier, isSKU);

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

    delete copy.time;
    const errors = validator(copy, 'add');

    if (errors !== null) {
        return callback(new Error(errors.join(', ')));
    }

    if (copy.max !== -1 && copy.max <= match.copy) {
        return callback(new Error('Max needs to be more than min'));
    }

    if (match.autoprice === copy.autoprice || copy.autoprice === false) {
        copy.time = null;
        remove(copy, false);
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

        copy.buy = prices.buy;
        copy.sell = prices.sell;
        copy.time = prices.time;

        remove(copy, false);
        add(copy, true);
        return callback(null, copy);
    });
};

exports.remove = function (identifier, isSKU, callback) {
    if (typeof isSKU === 'function') {
        callback = isSKU;
        isSKU = true;
    }

    let match = null;

    const key = isSKU ? 'sku' : 'name';

    for (let i = 0; i < pricelist.length; i++) {
        if (pricelist[i][key] === identifier) {
            match = pricelist[i];
            remove(i, true);
            break;
        }
    }

    if (match === null) {
        return callback(new Error('Item is not in the pricelist'));
    }

    return callback(null, match);
};

function remove (index, emit) {
    const match = pricelist[index];
    pricelist.splice(index, 1);

    if (emit === true) {
        const handler = handlerManager.getHandler();
        // Price of item changed
        handler.onPriceChange(match.sku, null);
        // Pricelist updated
        handler.onPricelist(pricelist);
    }
}
