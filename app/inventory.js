const log = require('lib/logger');
const manager = require('lib/manager');

const handlerManager = require('app/handler-manager');

let dictionary = {};

/**
 * Fetches an inventory
 * @param {Object|String} steamid SteamID object or steamid64
 * @param {Function} callback
 */
exports.getInventory = function (steamid, callback) {
    log.debug('Getting inventory for ' + steamid + '...');

    manager.getUserInventoryContents(steamid, 440, 2, true, function (err, items) {
        if (err) {
            log.debug('Error getting inventory for ' + steamid, { error: err });
            return callback(err);
        }

        log.debug('Got inventory for ' + steamid);

        if (manager.steamID.getSteamID64() === (typeof steamid === 'string' ? steamid : steamid.getSteamID64())) {
            inventoryUpdated(items);
        }

        callback(null, items);
    });
};

/**
 * Returns own cached inventory
 * @return {Object}
 */
exports.getOwnInventory = function () {
    return dictionary;
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
    const inventory = exports.getOwnInventory();

    for (const sku in inventory) {
        if (!Object.prototype.hasOwnProperty.call(inventory, sku)) {
            continue;
        }

        if (inventory[sku].indexOf(assetid) === -1) {
            return null;
        }

        return sku;
    }
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
 * @param {Array<Object>} items
 */
function inventoryUpdated (items) {
    dictionary = exports.createDictionary(items);
    log.debug('Our inventory updated');

    handlerManager.getHandler().onInventoryUpdated(dictionary);
}
