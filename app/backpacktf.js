const bptf = require('bptf-listings');
const async = require('async');

const utils = require('./utils.js');

let Automatic, manager, Items, log, config, Listings, Prices, Inventory;

let WAIT, LOST_ITEMS = [], GAINED_ITEMS = [];

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
    manager = automatic.manager;

    Items = automatic.items;
    Prices = automatic.prices;
    Inventory = automatic.inventory;
};

exports.init = function (callback) {
    Listings = new bptf({
        steamid64: Automatic.getOwnSteamID(),
        key: manager.apiKey,
        token: config.getAccount().bptfToken,
        items: Items.getModule()
    });

    log.debug('Initializing bptf-listings package.');
    Listings.init(function(err) {
        if (err) {
            callback(new Error('bptf-listings (' + err.message + ')'));
            return;
        }

        Listings.removeAll(function() {
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
    Listings.on('inventory', inventory);
};

exports.findBuyOrder = findBuyOrder;

exports.createListing = function (listing, force = false) { Listings.createListing(listing, force); };
exports.removeListing = function (id) { Listings.removeListing(id); };
exports.listingComment = listingComment;

exports.updateOrders = updateOrder;
exports.updateSellOrders = updateSellOrders;
exports.removeSellOrders = removeSellOrders;
exports.startUpdater = startListingUpdater;

exports.itemFromBuyOrder = function (listing) { return Listings.getItem(listing.item); };
exports.listings = getListings;
exports.sellOrders = sellOrders;
exports.buyOrders = buyOrders;

exports.isListed = isListed;
exports.getLimit = getLimit;

exports.cap = function () { return Listings.cap; };

exports.isBanned = banned;

function makeSellOrders() {
    if (Prices.ready == false) {
        return;
    }

    const dict = Inventory.dictionary();

    let list = [];
    for (let name in dict) {
        if (name == 'Refined Metal' || name == 'Reclaimed Metal' || name == 'Scrap Metal') continue;
        const ids = dict[name];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const listed = isListed(id);
            if (listed) continue;

            (list[name] = (list[name] || [])).push(id);
        }
    }

    for (let name in list) {
        let price = Prices.getPrice(name);
        if (!price) continue;

        price = price.price;
        const ids = list[name];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];

            Listings.createListing({
                intent: 1,
                id: id,
                currencies: price.sell,
                details: listingComment(1, name, price.sell)
            });
        }
    }
}

function makeBuyOrders() {
    const prices = Prices.list();
    for (let i = 0; i < prices.length; i++) {
        Listings.createListing({
            intent: 0,
            item: prices[i].item,
            currencies: prices[i].price.buy,
            details: listingComment(0, prices[i].item.name, prices[i].price.buy)
        }, true);
    }
}

function removeSellOrders(search) {
    const sell = sellOrders();
    for (let i = 0; i < sell.length; i++) {
        const listing = sell[i];
        const item = Listings.getItem(listing.item);
        const name = Items.getName(item);

        if (name != search) { continue; }

        Listings.removeListing(listing.id);
    }
}

function updateSellOrders(search, price) {
    const dict = Inventory.dictionary();

    for (let name in dict) {
        if (name == 'Refined Metal' || name == 'Reclaimed Metal' || name == 'Scrap Metal') continue;
        if (search != name) continue;

        const ids = dict[name];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            Listings.createListing({
                intent: 1,
                id: id,
                currencies: price.sell,
                details: listingComment(1, name, price.sell)
            }, true);
        }
    }
}

function updateOrder(item, received) {
    clearTimeout(WAIT);
    if (received) {
        GAINED_ITEMS.push(item);
    } else {
        LOST_ITEMS.push(item);
    }

    WAIT = setTimeout(function () {
        updateOrders(LOST_ITEMS, GAINED_ITEMS);
    }, 10 * 1000);
}

function updateOrders(lost, gained) {
    log.debug('Updating listings with lost / gained items');
    log.debug('Lost: ' + lost.length + ' - Gained: ' + gained.length);
    const lostSummary = Items.createSummary(Items.createDictionary(lost)), gainedSummary = Items.createSummary(Items.createDictionary(gained));
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

        const listing = findBuyOrder(name);
        if (listing == null) {
            list.push(name);
            continue;
        }

        const limit = config.limit(name);
        const stock = Inventory.amount(name);
        if (stock >= limit) {
            Listings.removeListing(listing.id);
        } else {
            Listings.createListing({
                intent: 0,
                item: listing.item,
                currencies: listing.currencies,
                details: listingComment(0, name, listing.currencies)
            }, true);
        }
    }

    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        let price = Prices.getPrice(name);
        if (price == null) { continue; }

        const item = price.item;
        price = price.price;

        const inInv = Inventory.amount(name);
        const limit = config.limit(name);
        if (limit > inInv) {
            Listings.createListing({
                intent: 0,
                item: item,
                currencies: price.buy,
                details: listingComment(0, name, price.buy)
            });
        }
    }

    LOST_ITEMS = [];
    GAINED_ITEMS = [];
}

function listingComment(intent, name, price) {
    let comment = config.get().comment;
    comment = intent == 1 ? comment.sell : comment.buy;

    comment = comment
        .replace(/%price%/g, utils.currencyAsText(price))
        .replace(/%name%/g, name);

    if (intent == 0) {
        const limit = config.limit(name);
        if (limit > 0) {
            const stock = Inventory.amount(name);
            comment = comment.replace(/%stock%/g, stock + ' / ' + limit);
        }
    }

    return comment;
}

function findBuyOrder(search) {
    let buy = buyOrders();
    for (let i = 0; i < buy.length; i++) {
        let listing = buy[i];
        const item = Listings.getItem(listing.item);
        const name = Items.getName(item);
        if (name == search) {
            listing.item = item;
            return listing;
        }
    }

    return null;
}

function getLimit(listing) {
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

function startListingUpdater() {
    updateListings();
    setTimeout(function () {
        updateListings();
    }, 30 * 60 * 1000);
}

function updateListings() {
    Listings.removeAll(function (err) {
        if (!err) {
            makeBuyOrders();
            makeSellOrders();
        }
    });
}

function banned(steamid64, callback) {
    if (config.get().acceptBanned === true) {
        callback(null, false);
        return;
    }

    async.series([
        function (callback) {
            isBanned(steamid64, function (err, banned) {
                if (err) callback(err);
                else if (banned) callback(null, 'all-features banned on www.backpack.tf');
                else callback(null, false);
            });
        },
        function (callback) {
            isMarked(steamid64, function (err, marked) {
                if (err) callback(err);
                else if (marked) callback(null, 'marked on www.steamrep.com as a scammer');
                else callback(null, false);
            });
        }
    ], function(err, banned) {
        if (err) callback(err);
        else if (banned[0][0] == true) callback(null, banned[0][1]);
        else if (banned[1][0] == true) callback(null, banned[1][1]);
        else callback(null, false);
    });
}

function inventory() { log.info('The inventory has been updated on www.backpack.tf.'); }
function listingCreated(name) { log.info('Created a listing for "' + name + '"'); }
function listingRemoved(id) { log.info('Removed a listing with the id "' + id + '"'); }
function listingError(type, name, error) {
    if (error != 1 && type != 'create') {
        log.warn('Failed to ' + type + ' a listing (' + name + '): ' + error);
    }
}
function heartbeat(bumped) {
    log.info('Heartbeat sent to www.backpack.tf' + (bumped > 0 ? '; Bumped ' + bumped + ' ' + utils.plural('listing', bumped) : '') + '.');
    makeSellOrders();
}

function getListings() { return Listings.listings; }
function buyOrders() {
    return getListings().filter(function (listing) {
        return listing.intent == 0;
    });
}
function sellOrders() {
    return getListings().filter(function (listing) {
        return listing.intent == 1;
    });
}
function isListed(id) {
    return sellOrders().some(function (listing) {
        return listing.item.id == id;
    });
}

function isBanned(steamid64, callback) {
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
        const banned = user.hasOwnProperty('bans');
        callback(null, banned);
    });
}

function isMarked(steamid64, callback) {
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