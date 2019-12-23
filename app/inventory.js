const manager = require('lib/manager');

const handlerManager = require('app/handler-manager');
const prices = require('app/prices');

let dictionary = {};
let nonTradableDictionary = {};

/**
 * Fetches an inventory
 * @param {Object|String} steamid SteamID object or steamid64
 * @param {Function} callback
 */
exports.getInventory = function (steamid, callback) {
    const isOurInv = manager.steamID.getSteamID64() === (typeof steamid === 'string' ? steamid : steamid.getSteamID64());
    manager.getUserInventoryContents(steamid, 440, 2, !isOurInv, function (err, items) {
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
 * @return {Array<Object>}
 */
exports.findBySKU = function (sku, includeInTrade = true) {
    const assetids = (dictionary[sku] || []);

    if (includeInTrade) {
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

exports.getCurrencies = function (dict) {
    let keys = 0;
    let refined = 0;
    let reclaimed = 0;
    let scrap = 0;

    for (const sku in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
            continue;
        }

        const amount = dict[sku].length;

        switch (sku) {
            case '5021;6':
                keys += amount;
                break;
            case '5002;6':
                refined += amount;
                break;
            case '5001;6':
                reclaimed += amount;
                break;
            case '5000;6':
                scrap += amount;
                break;
            default:
                break;
        }
    }

    return {
        keys,
        refined,
        reclaimed,
        scrap
    };
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
