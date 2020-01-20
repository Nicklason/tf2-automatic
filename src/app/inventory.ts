import manager from '../lib/manager';

import * as handlerManager from './handler-manager';
import * as prices from './prices';

let dictionary = {};
let nonTradableDictionary = {};

/**
 * Fetches an inventory
 * @param {Object|String} steamID SteamID object or steamid64
 * @param {Function} callback
 */
export function getInventory (steamID, callback) {
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
export function getDictionary (steamID, includeInTrade, callback) {
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
            callback(null, filterInTrade(Object.assign({}, dictionary)));
        }
        return;
    }

    getInventory(steamID, function (err, items) {
        if (err) {
            return callback(err);
        }

        return callback(null, createDictionary(items));
    });
};

/**
 * Returns own cached inventory
 * @param {Boolean} [onlyTradable=true]
 * @return {Object}
 */
export function getOwnInventory (onlyTradable = true) {
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

export function filterInTrade (dict) {
    const filtered = {};

    const itemsInTrade = require('./trade').inTrade();

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
export function getAmount (sku) {
    return findBySKU(sku).length;
};

/**
 * Returns the sku of the item, null if no match found
 * @param {String} assetid
 * @return {Object}
 */
export function findByAssetid (assetid) {
    const inventory = getOwnInventory(false);

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
 * @return {Array<String>}
 */
export function findBySKU (sku, includeInTrade = true) {
    const assetids = (dictionary[sku] || []);

    if (includeInTrade) {
        return assetids;
    }

    const itemsInTrade = require('./trade').inTrade();
    return assetids.filter((assetid) => itemsInTrade.indexOf(assetid) === -1);
};

export function amountCanTrade (sku, buy) {
    const amount = getAmount(sku);

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

export function isOverstocked (sku, buying, diff) {
    return amountCanTrade(sku, buying) + (buying ? -diff : diff) < 0;
};

/**
 * Gets an object with keys, refined, reclaimed and scrap
 * @param {Object} dict Items dictionary
 * @param {Boolean} [amount=false] If you want assetids or counts
 * @return {Object}
 */
export function getCurrencies (dict, amount = false) {
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
export function removeItem (assetid) {
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
export function addItem (sku, assetid) {
    (dictionary[sku] = (dictionary[sku] || [])).push(assetid);
};

/**
 * Makes a dictionary of items
 * @param {Array<Object>} items
 * @return {Object}
 */
export function createDictionary (items) {
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
    dictionary = createDictionary(tradable);
    nonTradableDictionary = createDictionary(nonTradable);

    handlerManager.getHandler().onInventoryUpdated(dictionary);
}
