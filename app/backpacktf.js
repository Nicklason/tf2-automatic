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
exports.handleBuyOrders = handleBuyOrders;
exports.handleSellOrders = handleSellOrders;

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
    isBPTFBanned(steamid64, function (err, banned) {
        if (err) {
            callback(err);
            return;
        } else if (banned) {
            callback(null, true, "all-features banned on www.backpack.tf");
            return;
        }

        isSRMarked(steamid64, function (err, marked) {
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

function isBPTFBanned(steamid64, callback) {
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

function isSRMarked(steamid64, callback) {
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

function handleBuyOrders(offer) {
    const their = offer.items.their;
    const items = createItemDict(their);
    if (items === false) {
        offer.abandon({ recheck: true });
        return false;
    }

    let unusuals = new Map();

    const buy = buyOrders();
    for (let i = 0; i < buy.length; i++) {
        const listing = buy[i];
        // Using the name from the schema because items may have the same name, but not the same defindex.
        const tag = Items.getItem(listing.item.defindex).item_name + "_" + listing.item.quality;

        // Get a mucher cleaner item object:
        // {
        //   "defindex": 5021,
        //   "quality": 'Unique',
        //   "craftable": true,
        //   "killstreak": 0,
        //   "australium": false,
        //   "effect": 'Cloud 9'
        // }
        // Effect is only set if there is an effect.
        let item = Listings.getItem(listing.item);
        const indices = items[tag];
        if (!indices) { continue; }

        for (let j = 0; j < indices.length; j++) {
            const index = indices[j];
            const original = their[index];

            if (Offer.isMetal(original)) {
                continue;
            }

            if (listing.item.quality == 5) {
                original.__index = index;
                let unusual = unusuals.get(original) || [];
                unusual.push({ item: item, currencies: listing.currencies });
                unusuals.set(original, unusual);
                continue;
            }

            if (item.effect) {
                // Find effect from the item that the user is offering
                let particle = Offer.getEffect(original);
                if (particle) {
                    // Convert effect name to the id from the schema.
                    particle = Items.getEffectId(particle);
                }
                // Check if the item that the user is offering has the same effect id as the item that we have listed on bptf
                if (item.effect != particle) {
                    continue;
                }
            }

            if (item.craftable != Offer.isCraftable(original)) {
                continue;
            }

            if (item.killstreak != Offer.isKillstreak(original)) {
                continue;
            }

            if (listing.currencies.keys) {
                offer.currencies.their.keys += listing.currencies.keys;
            }
            if (listing.currencies.metal) {
                offer.currencies.their.metal = utils.scrapToRefined(utils.refinedToScrap(offer.currencies.their.metal) + utils.refinedToScrap(listing.currencies.metal));
            }

            // The user is offering a key / craft weapon which we have a buy listing for
            if (Offer.isKey(original)) {
                offer.currencies.their.keys -= 1;
            } else if (Offer.isCraftWeapon(item)) {
                offer.currencies.their.metal = utils.scrapToRefined(utils.refinedToScrap(offer.currencies.their.metal) - utils.refinedToScrap(1 / 18));
            }
        }
    }

    for (let [original, listings] of unusuals) {
        let match = findEffectMatch(original, listings);
        if (!match) {
            for (let i = 0; i < listings.length; i++) {
                const item = listings[i].item;
                if (!item.effect) {
                    match = listings[i].currencies;
                    break;
                }
            }
        }

        if (match) {
            if (match.keys) {
                offer.currencies.their.keys += match.keys;
            }
            if (match.metal) {
                offer.currencies.their.metal = utils.scrapToRefined(utils.refinedToScrap(offer.currencies.their.metal) + utils.refinedToScrap(match.metal));
            }
        }
    }
}

function findEffectMatch(item, listings) {
    for (let i = 0; i < listings.length; i++) {
        const match = listings[i];
        // First we get the effect from the offer, then we get the id of the effect from the schema.
        const effect = Items.getEffectId(Offer.getEffect(item));
        if (effect == match.item.effect) {
            return match.currencies;
        }
    }
    return null;
}

function handleSellOrders(offer) {
    let ids = [];

    // Find items in the offer that matches the listings.
    const our = offer.items.our;
    const sell = sellOrders();
    for (let i = 0; i < sell.length; i++) {
        const listing = sell[i];
        const id = listing.item.id;

        for (let j = 0; j < our.length; j++) {
            const item = our[j];
            // Not the same item, we will continue looking.
            if (item.id != id) {
                continue;
            }

            if (listing.currencies.keys) {
                offer.currencies.our.keys += listing.currencies.keys;
            }
            if (listing.currencies.metal) {
                offer.currencies.our.metal = utils.scrapToRefined(utils.refinedToScrap(offer.currencies.our.metal) + utils.refinedToScrap(listing.currencies.metal));
            }

            // User is selling keys for metal
            if (Offer.isKey(item)) {
                offer.currencies.our.keys -= 1;
            }

            // User is selling craft weapon for pure
            if (Offer.isCraftWeapon(item)) {
                offer.currencies.our.metal = utils.scrapToRefined(utils.refinedToScrap(offer.currencies.our.metal) - utils.refinedToScrap(1 / 18));
            }

            // Found a match for the listing.
            ids.push(item.id);
            break;
        }
    }

    // Catch items that are not priced.
    for (let i = 0; i < our.length; i++) {
        // Skip keys and craft weapons.
        if (Offer.isKey(our[i]) || Offer.isCraftWeapon(our[i]) || Offer.isMetal(our[i])) {
            continue;
        }

        const id = our[i].assetid;

        if (!ids.includes(id)) {
            let item = Offer.getItem(our[i]);
            let name = Items.getName(item);
            offer.log("info", "contains an item that isn't in a listing (" + name + "), skipping");
            offer.logDetails("info");
            return false;
        }
    }
}

function createItemDict(their) {
    // Have offer.abandon function for rechecking offer.
    let items = {};

    for (let i = 0; i < their.length; i++) {
        const item = their[i];

        if (Offer.isMetal(item)) { continue; }

        const defindex = Offer.getDefindex(item);
        if (!defindex) { return false; }
        const quality = Offer.getQuality(item);
        if (!quality) { return false; }

        // Using the name from the schema because items may have the same name, but not the same defindex.
        let tag = Items.getItem(defindex).item_name + "_" + Items.getQuality(quality);
        // This creates an array for the tag containing the index of the items with the same tag.
        (items[tag] = (items[tag] || [])).push(i);
    }

    return items;
}

function updateInventory() {
    const options = {
        url: "https://backpack.tf/profiles/" + Automatic.getOwnSteamID() + "/"
    }
    utils.request.get(options, function () {});
}

exports.init = function (callback) {
    Listings = new BPTFListings({ key: manager.apiKey, token: config.getAccount().bptfToken });

    log.debug('Initializing bptf-listings package.');
    Listings.init(callback);

    Listings.on('heartbeat', heartbeat);
    Listings.on('created', listingCreated);
    Listings.on('removed', listingRemoved);
    Listings.on('error', listingError);
};

function heartbeat(bumped) {
    log.info("Heartbeat sent to www.backpack.tf" + (bumped > 0 ? "; Bumped " + bumped + " " + utils.plural("listing", bumped) : '') + ".");
    Listings.getListings();
    updateInventory();
    makeSellOrders();
}

function listingCreated(name) {
    log.info("Created a listing for \"" + name + "\"");
}

function listingRemoved(id) {
    log.debug("Removed a listing with the id " + id);
}

function listingError(type, name, error) {
    // Don't want to spam the console with items not being listed for sale because inventory hasn't updated on backpack.tf
    if (error != 1 && type != "create") {
        log.warn("Failed to " + type + " a listing (" + name + "): " + error);
    }
}