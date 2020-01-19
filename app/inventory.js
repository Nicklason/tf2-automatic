const manager = require('lib/manager');

const handlerManager = require('app/handler-manager');
const prices = require('app/prices');

let dictionary = {};
let nonTradableDictionary = {};

/**
 * Fetches an inventory
 * @param {Object|String} steamID SteamID object or steamid64
 * @param {Function} callback
 */
exports.getInventory = function (steamID, callback) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();
    const isOurInv = manager.steamID.getSteamID64() === steamID64;

    manager.getUserInventoryContents(steamID, 440, 2, !isOurInv, function (err, items) {
        if (err) {
            return callback(err);
        }

        const tradable = items.filter((item) => item.tradable);

        if (isOurInv) {
            inventoryUpdated(tradable, items.filter((item) => !item.tradable));
        }

        callback(null, tradable);
    });
};

/**
 * Gets items dictionary
 * @param {Object|String} steamID
 * @param {Boolean} [includeInTrade=true]
 * @param {Function} callback
 */
exports.getDictionary = function (steamID, includeInTrade, callback) {
    if (typeof includeInTrade === 'function') {
        callback = includeInTrade;
        includeInTrade = true;
    }

    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();
    const isOurInv = manager.steamID.getSteamID64() === steamID64;

    if (isOurInv) {
        if (includeInTrade) {
            callback(null, Object.assign({}, dictionary));
        } else {
            callback(null, exports.filterInTrade(Object.assign({}, dictionary)));
        }
        return;
    }

    exports.getInventory(steamID, function (err, items) {
        if (err) {
            return callback(err);
        }

        return callback(null, exports.createDictionary(items));
    });
};

/**
 * Returns own cached inventory
 * @param {Boolean} [onlyTradable=true]
 * @return {Object}
 */
exports.getOwnInventory = function (onlyTradable = true) {
    const inventory = Object.assign({}, dictionary);

    if (onlyTradable) {
        return inventory;
    }

    // Add non-tradable

    for (const sku in nonTradableDictionary) {
        if (!Object.prototype.hasOwnProperty.call(nonTradableDictionary, sku)) {
            continue;
        }

        inventory[sku] = (inventory[sku] || []).concat(nonTradableDictionary[sku]);
    }

    return inventory;
};

exports.filterInTrade = function (dict) {
    const filtered = {};

    const itemsInTrade = require('app/trade').inTrade();

    for (const sku in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
            continue;
        }

        const ids = dict[sku].filter((assetid) => itemsInTrade.indexOf(assetid) === -1);
        filtered[sku] = ids;
    }

    return filtered;
};

/**
 * Returns the amount of an item in our inventory
 * @param {String} sku
 * @return {Number}
 */
exports.getAmount = function (sku) {
    return exports.findBySKU(sku).length;
};

/**
 * Returns the sku of the item, null if no match found
 * @param {String} assetid
 * @param {Boolean} [includeInTrade=true]
 * @return {Object}
 */
exports.findByAssetid = function (assetid) {
    const inventory = exports.getOwnInventory(false);

    for (const sku in inventory) {
        if (!Object.prototype.hasOwnProperty.call(inventory, sku)) {
            continue;
        }

        if (inventory[sku].indexOf(assetid) === -1) {
            continue;
        }

        return sku;
    }

    return null;
};

/**
 * Returns all assetids with a matching sku
 * @param {String} sku
 * @param {Boolean} [includeInTrade=true]
 * @param {Object} [dict=undefined] Optional, use when searching different inventory
 * @return {Array<Object>}
 */
exports.findBySKU = function (sku, includeInTrade = true, dict = undefined) {
    if (typeof includeInTrade === 'object') {
        dict = includeInTrade;
        includeInTrade = true;
    }

    const assetids = ((dict[sku] || dictionary[sku]) || []);

    if (includeInTrade || dict !== undefined) {
        return assetids;
    }

    const itemsInTrade = require('app/trade').inTrade();
    return assetids.filter((assetid) => itemsInTrade.indexOf(assetid) === -1);
};

exports.amountCanTrade = function (sku, buy) {
    const amount = exports.getAmount(sku);

    const match = prices.get(sku);
    if (match === null) {
        return 0;
    }

    if (buy && match.max === -1) {
        return Infinity;
    }

    let canTrade = match[buy === true ? 'max' : 'min'] - amount;
    if (!buy) {
        canTrade *= -1;
    }

    return canTrade > 0 ? canTrade : 0;
};

/**
 * Gets an object with keys, refined, reclaimed and scrap
 * @param {Object} dict Items dictionary
 * @param {Boolean} [amount=false] If you want assetids or counts
 * @return {Object}
 */
exports.getCurrencies = function (dict, amount = false) {
    const currencies = {
        '5021;6': dict['5021;6'] || [],
        '5002;6': dict['5002;6'] || [],
        '5001;6': dict['5001;6'] || [],
        '5000;6': dict['5000;6'] || []
    };

    if (amount === true) {
        for (const sku in currencies) {
            if (!Object.prototype.hasOwnProperty.call(currencies, sku)) {
                continue;
            }

            currencies[sku] = currencies[sku].length;
        }
    }

    return currencies;
};

/**
 * Removes an item from our cached inventory
 * @param {String} assetid
 */
exports.removeItem = function (assetid) {
    for (const sku in dictionary) {
        if (!Object.prototype.hasOwnProperty.call(dictionary, sku)) {
            continue;
        }

        if (dictionary[sku] === undefined) {
            continue;
        }

        const index = dictionary[sku].indexOf(assetid);
        if (index !== -1) {
            dictionary[sku].splice(index, 1);
        }
    }
};

/**
 * Adds an item to our cached inventory
 * @param {String} sku
 * @param {String} assetid
 */
exports.addItem = function (sku, assetid) {
    (dictionary[sku] = (dictionary[sku] || [])).push(assetid);
};

/**
 * Makes a dictionary of items
 * @param {Array<Object>} items
 * @return {Object}
 */
exports.createDictionary = function (items) {
    const dict = {};

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const sku = item.getSKU();
        (dict[sku] = (dict[sku] || [])).push(item.id);
    }

    return dict;
};

/**
 * Function is called when our inventory is fetched
 * @param {Array<Object>} tradable
 * @param {Array<Object>} nonTradable
 */
function inventoryUpdated (tradable, nonTradable) {
    dictionary = exports.createDictionary(tradable);
    nonTradableDictionary = exports.createDictionary(nonTradable);

    handlerManager.getHandler().onInventoryUpdated(dictionary);
}
