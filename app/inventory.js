let inventory = [];

const manager = require('lib/manager');

const handlerManager = require('app/handler-manager');

/**
 * Fetches an inventory
 * @param {Object|String} steamid SteamID object or steamid64
 * @param {Function} callback
 */
exports.getInventory = function (steamid, callback) {
    manager.getUserInventoryContents(steamid, 440, 2, false, function (err, items) {
        if (err) {
            return callback(err);
        }

        if (manager.steamID.getSteamID64() === (typeof steamid === 'string' ? steamid : steamid.getSteamID64())) {
            inventoryUpdated(items);
        }

        callback(null, items);
    });
};

/**
 * Returns own cached inventory
 * @return {Array<Object>}
 */
exports.getOwnInventory = function () {
    return inventory;
};

/**
 * Returns the amount of an item in our inventory
 * @param {String} sku
 * @return {Number}
 */
exports.getAmount = function (sku) {
    let amount = 0;

    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];

        if (item.getSKU() === sku) {
            amount++;
        }
    }

    return amount;
};

/**
 * Removes an item from our cached inventory
 * @param {String} assetid
 */
exports.removeItem = function (assetid) {
    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];

        if (item.assetid == assetid) {
            inventory.splice(i, 1);
            break;
        }
    }
};

/**
 * Function is called when our cached inventory is updated
 * @param {Array<Object>} items
 */
function inventoryUpdated (items) {
    inventory = items;
    handlerManager.getHandler().onInventoryUpdated(inventory);
}
