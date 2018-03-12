const BPTFListings = require('bptf-listings');

const utils = require('./utils.js');
const Offer = require('./offer.js');

let Automatic, manager, Items, log, config, Listings, Prices, Inventory;

let _wait, _lostItems = [], _gainedItems = [];

exports.register = function (automatic) {
    Automatic = automatic;
    manager = automatic.manager;
    Items = automatic.items;
    Prices = automatic.prices;
    Inventory = automatic.inventory;

    log = automatic.log;
    config = automatic.config;
};

exports.findBuyOrder = findBuyOrder;

exports.createListing = function (listing, force = false) { Listings.createListing(listing, force); };
exports.removeListing = function (id) { Listings.removeListing(id); };
exports.listingComment = listingComment;

exports.updateOrders = updateOrder;
exports.updateSellOrders = updateSellOrders;
exports.removeSellOrders = removeSellOrders;

exports.itemFromBuyOrder = function (listing) { return Listings.getItem(listing.item); };
exports.listings = getListings;
exports.sellOrders = sellOrders;
exports.buyOrders = buyOrders;

exports.isListed = isListed;
exports.getLimit = getLimit;

exports.cap = function () { return Listings.cap; };

exports.isBanned = isBanned;

// This will only make sell orders of items that are not already listed.
function makeSellOrders() {
    const inv = Inventory.get();

    let items = [];
    for (let i = 0; i < inv.length; i++) {
        if (Offer.isMetal(inv[i])) continue;

        const id = inv[i].assetid;
        const listed = isListed(id);
        // Skip items that are already listed on bptf
        if (listed) continue;

        // Get parsed item object
        const item = Offer.getItem(inv[i]);
        // Get name of the item.
        const name = Items.getName(item);

        (items[name] = (items[name] || [])).push(id);
    }

    for (var name in items) {
        const price = Prices.getPrice(name);
        if (!price) continue;

        const ids = items[name];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            Listings.createListing({
                intent: 1,
                id: id,
                currencies: price.price.sell,
                details: listingComment(1, name, price.price.sell)
            });
        }
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

// Update sell orders for a specific item.
function updateSellOrders(search, price) {
    const inv = Inventory.get();

    let items = [];
    for (let i = 0; i < inv.length; i++) {
        if (Offer.isMetal(inv[i])) { continue; }

        const item = Offer.getItem(inv[i]);
        const name = Items.getName(item);

        if (search != name) { continue; }

        // Todo: Only update listing if the prices does not match up.
        const id = inv[i].assetid;
        Listings.createListing({
            intent: 1,
            id: id,
            currencies: price.sell,
            details: listingComment(1, name, price.sell)
        }, true);
    }
}

function updateOrder(item, received) {
    clearTimeout(_wait);
    if (received) {
        _gainedItems.push(item);
    } else {
        _lostItems.push(item);
    }

    // Waiting 10 seconds to catch other items and other offers.
    _wait = setTimeout(function () {
        updateOrders(_lostItems, _gainedItems);
    }, 10 * 1000);
}

function updateOrders(lost, gained) {
    log.debug("Updating listings with lost / gained items");
    log.debug("Lost: " + lost.length + " - Gained: " + gained.length);
    let lostSummary = Items.summary(lost),
        gainedSummary = Items.summary(gained);

    let names = [];
    for (const name in lostSummary) {
        if (!names.includes(name)) {
            names.push(name);
        }
    }
    for (const name in gainedSummary) {
        if (!names.includes(name)) {
            names.push(name);
        }
    }

    let noBuyOrder = [];
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        // Don't check for metal.
        if (name == "Scrap Metal" || name == "Reclaimed Metal" || name == "Refined Metal") { continue; }

        // Find buy order that contains the item
        const listing = findBuyOrder(name);
        if (listing == null) {
            // We will check if we need to make a listing for this item.
            noBuyOrder.push(name);
            continue;
        }

        const stock = getLimit(listing);
        // No limit, we don't need to check if limit has been exceeded.
        if (!stock) { continue; }
        const inInv = Inventory.getAmount(name);
        if (inInv >= stock.limit) {
            // Remove listing since the limit has been reached.
            Listings.removeListing(listing.id);
        } else if (stock.stock != inInv){
            Listings.createListing({
                intent: 0,
                item: Listings.getItem(listing.item),
                details: listing.details.replace(stock.raw, inInv + ' / ' + stock.limit),
                currencies: listing.currencies
            }, true);
        }
    }

    for (let i = 0; i < noBuyOrder.length; i++) {
        const name = noBuyOrder[i];
        const priceObj = Prices.getPrice(name);
        if (priceObj == null) { continue; }

        const inInv = Inventory.getAmount(name);
        const limit = config.getLimit(name);
        if (limit > inInv) {
            Listings.createListing({
                intent: 0,
                item: priceObj.item,
                currencies: priceObj.price.buy,
                details: listingComment(0, name, priceObj.price.buy)
            });
        }
    }
}

function listingComment(intent, name, price) {
    let comment = config.get().comment;
    comment = intent == 1 ? comment.sell : comment.buy;

    comment = comment
        .replace(/%price%/g, utils.currencyAsText(price))
        .replace(/%name%/g, name);

    if (intent == 0) {
        const limit = config.getLimit(name);
        if (limit > 0) {
            const stock = Inventory.getAmount(name);
            comment = comment.replace(/%stock%/g, stock + " / " + limit);
        }
    }

    return comment;
};

// Used to find a buy order for a given item.
// This is used to create / update / remove buy orders when an offer has been accepted and the inventory changes.
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

function getListings() {
    return Listings.listings;
}

function isBanned(steamid64, callback) {
    // Eh... ok, if you say so.
    if (config.get().acceptBanned === true) {
        callback(null, false);
        return;
    }

    // Use async libary.
    isBanned(steamid64, function (err, banned) {
        if (err) {
            callback(err);
            return;
        } else if (banned) {
            callback(null, true, "all-features banned on www.backpack.tf");
            return;
        }

        isMarked(steamid64, function (err, marked) {
            if (err) {
                callback(err);
                return;
            } else if (marked) {
                callback(null, true, "marked on www.streamrep.com as a scammer");
                return;
            }

            callback(null, false);
        });
    });
}

function isBanned(steamid64, callback) {
    const options = {
        url: "https://backpack.tf/api/users/info/v1",
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
        const banned = user.bans && user.bans.all;
        callback(null, banned);
    });
}

function isMarked(steamid64, callback) {
    const options = {
        url: "http://steamrep.com/api/beta4/reputation/" + steamid64,
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

        const isMarked = body.steamrep.reputation.summary.toLowerCase().indexOf("scammer") !== -1;
        callback(null, isMarked);
    });
}

function buyOrders() {
    let listings = getListings();
    return listings.filter(function (listing) {
        return listing.intent == 0;
    });
}

function sellOrders() {
    let listings = getListings();
    return listings.filter(function (listing) {
        return listing.intent == 1;
    });
}

function isListed(id) {
    const listings = sellOrders();
    return listings.some(function (listing) {
        return listing.item.id == id;
    });
}

exports.init = function (callback) {
    Listings = new BPTFListings({ steamid64: Automatic.getOwnSteamID(), key: manager.apiKey, token: config.getAccount().bptfToken });

    log.debug('Initializing bptf-listings package.');
    Listings.init(callback);

    Listings.on('heartbeat', heartbeat);
    Listings.on('created', listingCreated);
    Listings.on('removed', listingRemoved);
    Listings.on('error', listingError);
    Listings.on('inventory', inventory);
};

function heartbeat(bumped) {
    log.info("Heartbeat sent to www.backpack.tf" + (bumped > 0 ? "; Bumped " + bumped + " " + utils.plural("listing", bumped) : '') + ".");
    makeSellOrders();
}

function listingCreated(name) {
    log.info("Created a listing for \"" + name + "\"");
}

function listingRemoved(id) {
    log.info("Removed a listing with the id \"" + id + "\"");
}

function listingError(type, name, error) {
    // Don't want to spam the console with items not being listed for sale because inventory hasn't updated on backpack.tf
    if (error != 1 && type != "create") {
        log.warn("Failed to " + type + " a listing (" + name + "): " + error);
    }
}

function inventory(time) {
    log.info("The inventory has been updated on www.backpack.tf.");
}