const fs = require('graceful-fs');

let Automatic, log, config, manager, Items;

const INVENTORY_FILENAME = 'temp/inventory.json';

let INVENTORY = [], DICTIONARY = {};

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    manager = automatic.manager;

    Items = automatic.items;
};

exports.init = function (callback) {
    log.debug('Initializing inventory.');
    getInventory(Automatic.getOwnSteamID(), function (err) {
        if (err) {
            callback(new Error('inventory (' + err.message + ')'));
            return;
        }
        callback(null);
    });
};

exports.getInventory = getInventory;
exports.get = inventory;
exports.update = update;
exports.getDictionary = getDictionary;
exports.dictionary = dictionary;
exports.amount = amountInDictionary;
exports.overstocked = isOverstocked;
exports.save = save;

function getInventory(steamid64, callback) {
    const own = steamid64 == Automatic.getOwnSteamID();
    const method = own == true ? 'getInventoryContents' : 'getUserInventoryContents';
    let args = [];

    if (!own) args.push(steamid64);
    args = args.concat([440, 2, true, function(err, inventory) {
        if (err) {
            callback(err);
            return;
        }

        if (own) save(inventory);
        callback(null, inventory);
    }]);

    manager[method].apply(manager, args);
}

function save(inventory) {
    update(inventory);
    fs.writeFile(INVENTORY_FILENAME, JSON.stringify(inventory), function (err) {
        if (err) {
            log.warn('Error writing inventory data: ' + err);
        }
    });
}

function update(inventory) {
    INVENTORY = inventory;
    DICTIONARY = Items.createDictionary(inventory);
}

function dictionary() {
    return DICTIONARY;
}

function inventory() {
    return INVENTORY;
}

function getDictionary(steamid64, callback) {
    if (steamid64 == Automatic.getOwnSteamID()) {
        callback(null, DICTIONARY);
        return;
    }

    getInventory(steamid64, function (err, inventory) {
        if (err) {
            callback(err);
            return;
        }

        const dictionary = Items.createDictionary(inventory);
        callback(null, dictionary);
    });
}

function amountInDictionary(dictionary, name) {
    if (name == undefined) {
        name = dictionary;
        dictionary = DICTIONARY;
    }

    const amount = Array.isArray(dictionary[name]) ? dictionary[name].length : 0;
    return amount;
}

function isOverstocked(name, amount = 0) {
    // If the amount is less than 0, that means we are selling, then we don't need to check for overstock.
    if (amount < 0) {
        return false;
    }

    const limit = config.limit(name);
    const stock = amountInDictionary(name);

    return amount + stock > limit;
}