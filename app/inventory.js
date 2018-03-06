const fs = require('graceful-fs');

const Offer = require('./offer.js');
const utils = require('./utils.js');

let Automatic, log, config, manager, client, Items, Prices;

const FOLDER_NAME = 'temp';
const INVENTORY_FILENAME = FOLDER_NAME + '/inventory.json';

let inventory = [], summary = [];

exports.save = save;
exports.getOwn = getOwn;
exports.getInventory = getInventory;
exports.getPure = getPure;

exports.summary = function() {
    if (summary.length == 0) {
        summary = createSummary();
    }
    return summary;
};
exports.getAmount = getAmount;

exports.get = function() { return inventory; };

function getPure(dict, useKeys) {
    const keyValue = utils.refinedToScrap(Prices.key());

    let keys = useKeys ? (dict["Mann Co. Supply Crate Key"] || []) : [];
    const refined = dict["Refined Metal"] || [];
    const reclaimed = dict["Reclaimed Metal"] || [];
    const scrap = dict["Scrap Metal"] || [];

    const total = keys.length * keyValue + refined.length * 9 + reclaimed.length * 3 + scrap.length;

    return {
        keys: keys,
        refined: refined,
        reclaimed: reclaimed,
        scrap: scrap,
        value: total
    };
}

function createSummary() {
    let items = {};

    for (let i = 0; i < inventory.length; i++) {
        let item = Offer.getItem(inventory[i]);
        const name = Items.getName(item);

        items[name] = (items[name] || 0) + 1;
    }

    return items;
}

function getAmount(name) {
    return summary[name] || 0;
}

function save(newInv) {
    update(newInv);
    fs.writeFile(INVENTORY_FILENAME, JSON.stringify(newInv), function(err) {
        if (err) {
            log.warn("Error writing inventory data: " + err);
        }
    });
}

function getOwn(refresh = false, callback) {
    if (refresh) {
        manager.getInventoryContents(440, 2, true, function (err, inv) {
            if (err) {
                callback(err);
                return;
            }
            save(inv)
            callback(null, inv);
        });
    } else if (fs.existsSync(config.lastAccount() + "." + INVENTORY_FILENAME)) {
        const inv = utils.parseJSON(fs.readFileSync(config.lastAccount() + "." + INVENTORY_FILENAME));
        if (inv == null) {
            getOwn(true, callback);
            return;
        }
        update(inv);
        callback(null, inventory);
    } else {
        getOwn(true, callback);
    }
}

function getInventory(steamid64, callback) {
    if (steamid64 == Automatic.getOwnSteamID()) {
        callback(null, Items.createItemDict(Items.getItems(inventory)));
        return;
    }

    manager.getUserInventoryContents(steamid64, 440, 2, true, function (err, inv) {
        if (err) {
            callback(err);
            return;
        }

        const items = Items.createItemDict(Items.getItems(inv));
        callback(null, items);
    });
}

function update(inv) {
    inventory = inv;
    summary = createSummary();
}

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    manager = automatic.manager;
    Items = automatic.items;
    Prices = automatic.prices;
};

exports.init = function(callback) {
    log.debug('Initializing inventory.');
    getOwn(true, callback);
};