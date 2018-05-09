const fs = require('graceful-fs');
const utils = require('./utils.js');

let Automatic, log, config, manager, Items, Prices;

const INVENTORY_FILENAME = 'temp/inventory.json';

let INVENTORY = [], DICTIONARY = {};

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    manager = automatic.manager;

    Items = automatic.items;
    Prices = automatic.prices;
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
exports.status = metalStatus;
exports.save = save;

function getInventory(steamid64, callback) {
    if (callback == undefined) {
        callback = utils.void;
    }

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

function isOverstocked(name, amount) {
    const limit = config.limit(name);
    if (limit == -1) return false;
    if (limit == 0) return true;

    const stock = amountInDictionary(name);
    const canBuy = limit - stock;

    if (canBuy <= 0) return true;
    if (canBuy - amount < 0) return canBuy;
    return false;
}

function metalStatus() {
    const pure = amountInDictionary('Refined Metal') * 9 + amountInDictionary('Reclaimed Metal') * 3 + amountInDictionary('Scrap Metal');
    const wanted = config.get('metalSupply', config.default('metalSupply'));
    if (wanted < 0) {
        return 1;
    }

    const key = utils.refinedToScrap(Prices.key());
    const min = wanted - key;
    const max = wanted + key;

    if (utils.between(pure, min, max)) {
        return 0;
    }

    if (pure > max) {
        return 1;
    } else {
        return -1;
    }
}