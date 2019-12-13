const log = require('lib/logger');
const api = require('lib/ptf-api');
const socket = require('lib/ptf-socket');
const validator = require('lib/validator');

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
                        pricelist[i].buy = prices[j].buy;
                        pricelist[i].sell = prices[j].sell;
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
    pricelist = v;
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

exports.get = function (sku) {
    const match = pricelist.find((v) => v.sku === sku);

    return match === undefined ? null : match;
};

exports.add = function (sku, data, callback) {
    log.debug('Handling request to add item to pricelist', { sku: sku, data: data });

    const match = exports.get(sku);

    if (match !== null) {
        callback(new Error('Item is already in the pricelist'));
        return;
    } else if (handling.indexOf(sku) !== -1) {
        callback(new Error('Item is already being changed'));
        return;
    }

    const entry = Object.assign({
        sku: sku
    }, data);

    // Validate data object
    const errors = validator(entry, 'add');

    if (errors !== null) {
        return callback(new Error(errors.join(', ')));
    }

    if (entry.autoprice !== true) {
        entry.time = null;
        add(entry, true);
        return callback(null);
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
        return callback(null);
    });
};

function add (entry, emit) {
    log.debug('Adding item to pricelist', { entry: entry });

    const errors = validator(entry, 'pricelist');

    if (errors !== null) {
        throw new Error(errors.join(', '));
    }

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
    const match = exports.get(sku);

    if (match === null) {
        callback(new Error('Item is not in the pricelist'));
        return;
    } else if (handling.indexOf(sku) !== -1) {
        callback(new Error('Item is already being changed'));
        return;
    }

    const copy = Object.assign({}, match);

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

    if (match.autoprice === copy.autoprice || copy.autoprice === false) {
        copy.time = null;
        remove(copy, false);
        add(copy, true);
        return callback(null);
    }

    handling.push(sku);

    // TODO: If the item is not in the pricestf pricelist then request a check
    api.getPrice(sku, 'bptf', function (err, prices) {
        handling.splice(handling.indexOf(sku), 1);
        if (err) {
            return callback(err);
        }

        copy.buy = prices.buy;
        copy.sell = prices.sell;
        copy.time = prices.time;

        remove(copy, false);
        add(copy, true);
        return callback(null);
    });
};

exports.remove = function (sku, callback) {
    let found = false;

    for (let i = 0; i < pricelist.length; i++) {
        if (pricelist[i].sku === sku) {
            remove(i, true);
            found = true;
            break;
        }
    }

    if (!found) {
        return callback(new Error('Item is not in the pricelist'));
    }

    return callback(null);
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
