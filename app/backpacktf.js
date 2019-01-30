const BptfListings = require('bptf-listings');
const async = require('async');

const utils = require('./utils.js');

let Automatic;
let Items;
let log;
let config;
let Listings;
let Prices;
let Inventory;

let WAIT;
let LOST_ITEMS = [];
let GAINED_ITEMS = [];

let UPDATE_INTERVAL;

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;

    Items = automatic.items;
    Prices = automatic.prices;
    Inventory = automatic.inventory;
};

exports.init = function (callback) {
    Listings = new BptfListings({
        steamid64: Automatic.getOwnSteamID(),
        accessToken: config.getAccount().bptfToken,
        items: Items.getModule()
    });

    log.debug('Initializing bptf-listings package.');
    Listings.init(function (err) {
        if (err) {
            callback(new Error('bptf-listings (' + err.message + ')'));
            return;
        }

        Listings.removeAll(function () {
            if (err) {
                callback(new Error('bptf-listings (' + err.message + ')'));
                return;
            }

            log.debug('Removed all listings from backpack.tf');

            callback(null);
        });
    });

    Listings.on('heartbeat', heartbeat);
    Listings.on('created', listingCreated);
    Listings.on('removed', listingRemoved);
    Listings.on('error', listingError);
    Listings.on('retry', listingRetry);
    Listings.on('inventory', inventory);
};

exports.stop = function (callback) {
    log.debug('Stopping backpacktf.js...');
    clearInterval(UPDATE_INTERVAL);
    Listings.removeAll(function (err) {
        if (err) {
            log.warn('An error occurred while trying to remove all listings from www.backpack.tf: ' + err.message);
            log.debug(err.stack);
        }

        log.debug('Removed all listings');
        Listings.stop();
        callback();
    });
};

exports.findBuyOrder = findBuyOrder;

exports.createListing = function (listing, force = false) {
    Listings.createListing(listing, force);
};
exports.removeListing = function (id) {
    Listings.removeListing(id);
};
exports.listingComment = listingComment;

exports.updateOrders = updateOrder;
exports.updateSellOrders = updateSellOrder;
exports.removeSellOrders = removeSellOrders;
exports.startUpdater = startListingUpdater;

exports.itemFromBuyOrder = function (listing) {
    return Listings._getItem(listing.item);
};
exports.listings = getListings;
exports.sellOrders = sellOrders;
exports.buyOrders = buyOrders;

exports.isListed = isListed;
exports.getLimit = getLimit;
exports.removeAll = function (callback) {
    Listings.removeAll(callback);
};

exports.cap = function () {
    return Listings.cap;
};

exports.isBanned = banned;

function makeSellOrders () {
    const dict = Inventory.dictionary();

    let list = [];
    for (let name in dict) {
        if (name == 'Refined Metal' || name == 'Reclaimed Metal' || name == 'Scrap Metal') continue;
        const ids = dict[name];

        let listed = false;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (isListed(id)) {
                listed = true;
            }
        }

        if (!listed) {
            list[name] = ids[0];
        }
    }

    for (let name in list) {
        if (!list.hasOwnProperty(name)) {
            continue;
        }

        let price = Prices.getPrice(name);
        if (price == null || price.price == null) continue;

        if (price.intent != 1 && price.intent != 2) {
            continue;
        }

        price = price.price;
        if (!price.hasOwnProperty('sell')) continue;
        const id = list[name];
        Listings.createListing({
            intent: 1,
            id: id,
            currencies: price.sell,
            details: listingComment(1, name, price.sell)
        });
    }
}

function makeBuyOrders () {
    const prices = Prices.list();
    for (let i = 0; i < prices.length; i++) {
        const listing = prices[i];
        if (listing.prices == null || !listing.prices.hasOwnProperty('buy')) continue;
        if (listing.intent != 0 && listing.intent != 2) {
            continue;
        }
        const item = Prices.getItem(listing);
        const limit = Prices.getLimit(item.name);
        const stock = Inventory.amount(item.name);
        if (stock < limit) {
            Listings.createListing({
                intent: 0,
                item: item,
                currencies: listing.prices.buy,
                details: listingComment(0, item.name, listing.prices.buy)
            }, true);
        }
    }
}

function removeSellOrders (search) {
    const sell = sellOrders();
    for (let i = 0; i < sell.length; i++) {
        const listing = sell[i];
        const item = Listings._getItem(listing.item);
        const name = Items.getName(item);

        if (name != search) {
            continue;
        }

        Listings.removeListing(listing.id);
    }
}

function updateSellOrder (search) {
    let price = Prices.getPrice(search);
    if (price == null || price.price == null) return;
    price = price.price;
    if (!price.hasOwnProperty('sell')) return;

    const dict = Inventory.dictionary();
    const ids = dict[search] || [];
    if (ids.length == 0) return;

    const order = findSellOrder(search);
    const id = order != null ? order.item.id : ids[0];
    Listings.createListing({
        intent: 1,
        id: id,
        currencies: price.sell,
        details: listingComment(1, search, price.sell)
    }, true);
}

function updateOrder (item, received) {
    clearTimeout(WAIT);
    if (received) {
        GAINED_ITEMS.push(item);
    } else {
        LOST_ITEMS.push(item);
    }

    WAIT = setTimeout(function () {
        updateOrders(LOST_ITEMS, GAINED_ITEMS);
    }, 5 * 1000);
}

function updateOrders (lost, gained) {
    log.debug('Updating listings with lost / gained items');
    log.debug('Lost: ' + lost.length + ' - Gained: ' + gained.length);
    const lostSummary = Items.createSummary(Items.createDictionary(lost));
    const gainedSummary = Items.createSummary(Items.createDictionary(gained));
    let names = [];

    for (const name in lostSummary) {
        if (!names.includes(name)) names.push(name);
    }

    for (const name in gainedSummary) {
        if (!names.includes(name)) names.push(name);
    }

    let list = [];
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (name == 'Scrap Metal' || name == 'Reclaimed Metal' || name == 'Refined Metal') continue;

        updateSellOrder(name);

        const listing = findBuyOrder(name);
        if (listing == null) {
            list.push(name);
            continue;
        }

        let currencies = listing.currencies;
        currencies.metal = currencies.metal || 0;
        currencies.keys = currencies.keys || 0;

        const limit = Prices.getLimit(name);
        const stock = Inventory.amount(name);
        if (stock >= limit) {
            Listings.removeListing(listing.id);
        } else {
            Listings.createListing({
                intent: 0,
                item: listing.item,
                currencies: currencies,
                details: listingComment(0, name, currencies)
            }, true);
        }
    }

    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        let price = Prices.getPrice(name);
        if (price == null || price.prices == null) continue;
        const item = price.item;
        price = price.price;
        if (!price.hasOwnProperty('buy')) continue;

        const inInv = Inventory.amount(name);
        const limit = Prices.getLimit(name);
        if (limit > inInv) {
            Listings.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: listingComment(0, name, price.buy)
            }, true);
        }
    }

    LOST_ITEMS = [];
    GAINED_ITEMS = [];
}

function listingComment (intent, name, price) {
    let comment = config.get().comment;
    comment = intent == 1 ? comment.sell : comment.buy;

    comment = comment
        .replace(/%price%/g, utils.currencyAsText(price))
        .replace(/%name%/g, name);

    const stock = Inventory.amount(name);
    const limit = Prices.getLimit(name);

    comment = comment.replace(/%max_stock%/g, limit);
    comment = comment.replace(/%current_stock%/g, stock);

    return comment;
}

function findBuyOrder (search) {
    let buy = buyOrders();
    for (let i = 0; i < buy.length; i++) {
        let listing = buy[i];
        const item = Listings._getItem(listing.item);
        const name = Items.getName(item);
        if (name == search) {
            listing.item = item;
            return listing;
        }
    }

    return null;
}

function findSellOrder (search) {
    const dict = Inventory.dictionary();
    const ids = dict[search] || [];
    if (ids.length == 0) {
        return null;
    }

    let sell = sellOrders();
    for (let i = 0; i < sell.length; i++) {
        let listing = sell[i];
        for (let j = 0; j < ids.length; j++) {
            const id = ids[j];
            if (listing.item.id == id) {
                return listing;
            }
        }
    }

    return null;
}

function getLimit (listing) {
    const details = listing.details;
    // Searches for "<number> / <number>".
    let stock = details.match(/[\d]* \/ [\d]*/);
    if (stock != null) {
        stock = stock[0];
        return {
            stock: Number(stock.substr(0, stock.indexOf('/') - 1)),
            limit: Number(stock.substr(stock.indexOf('/') + 2)),
            raw: stock
        };
    }

    return null;
}

function startListingUpdater () {
    updateListings();
    UPDATE_INTERVAL = setInterval(function () {
        updateListings();
    }, 30 * 60 * 1000);
}

function updateListings () {
    Listings.removeAll(function (err) {
        if (!err) {
            makeSellOrders();
            makeBuyOrders();
        }
    });
}

function banned (steamid64, callback) {
    if (config.get().acceptBanned === true) {
        callback(null, false);
        return;
    }

    async.series([
        function (callback) {
            isBanned(steamid64, function (err, banned) {
                if (err) callback(err);
                else if (banned == true) callback(null, 'banned on www.backpack.tf');
                else callback(null, false);
            });
        },
        function (callback) {
            isMarked(steamid64, function (err, marked) {
                if (err) callback(err);
                else if (marked == true) callback(null, 'marked on www.steamrep.com as a scammer');
                else callback(null, false);
            });
        }
    ], function (err, banned) {
        if (err) {
            return callback(err);
        }

        let reason = '';
        for (let i = 0; i < banned.length; i++) {
            if (typeof banned[i] == 'string') {
                reason += reason == '' ? banned[i] : ' and ' + banned[i];
            }
        }

        callback(null, reason == '' ? false : reason);
    });
}

function inventory () {
    log.info('The inventory has been updated on www.backpack.tf.');
}
function listingCreated (name) {
    log.debug('Created a listing for ' + name);
}
function listingRemoved (id) {
    log.debug('Removed a listing with the id ' + id);
}
function listingError (type, name, error) {
    log.debug('An error occurred while trying to ' + type + ' a listing (' + name + '): ' + error);
}
function listingRetry (name, time) {
    log.debug('Could not create a listing for ' + name + '. You should try again at ' + time);
}
function heartbeat (bumped) {
    log.info('Heartbeat sent to www.backpack.tf' + (bumped > 0 ? '; Bumped ' + bumped + ' ' + utils.plural('listing', bumped) : '') + '.');
    makeSellOrders();
}

function getListings () {
    return Listings.listings;
}
function buyOrders () {
    return getListings().filter(function (listing) {
        return listing.intent == 0;
    });
}
function sellOrders () {
    return getListings().filter(function (listing) {
        return listing.intent == 1;
    });
}
function isListed (id) {
    return sellOrders().some(function (listing) {
        return listing.item.id == id;
    });
}

function isBanned (steamid64, callback) {
    const options = {
        url: 'https://backpack.tf/api/users/info/v1',
        qs: {
            key: config.get().bptfKey,
            steamids: steamid64
        },
        gzip: true,
        json: true,
        timeout: 10000
    };

    utils.request.get(options, function (err, body) {
        if (err) {
            callback(err);
            return;
        }

        const user = body.users[steamid64];
        let banned = false;
        if (user.hasOwnProperty('bans') && user.bans.hasOwnProperty('all')) {
            banned = true;
        }
        callback(null, banned);
    });
}

function isMarked (steamid64, callback) {
    const options = {
        url: 'http://steamrep.com/api/beta4/reputation/' + steamid64,
        qs: {
            json: 1
        },
        gzip: true,
        json: true,
        timeout: 10000
    };

    utils.request.get(options, function (err, body) {
        if (err) {
            callback(err);
            return;
        }

        const isMarked = body.steamrep.reputation.summary.toLowerCase().indexOf('scammer') !== -1;
        callback(null, isMarked);
    });
}
