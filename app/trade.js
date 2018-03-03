const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('graceful-fs');

const utils = require('./utils.js');
const Offer = require('./offer.js');
const queue = require('./queue.js');

let Automatic, manager, Prices, items, log, config;

const POLLDATA_FILENAME = 'temp/polldata.json';

let ready = false, received = [], doingQueue = false, inTrade = [];

exports.register = function (automatic) {
    Automatic = automatic;
    manager = automatic.manager;
    client = automatic.client;
    log = automatic.log;
    config = automatic.config;

    Inventory = automatic.inventory;
    Backpack = automatic.backpack;
    Prices = automatic.prices;
    Items = automatic.items;
    Friends = automatic.friends;

    if (fs.existsSync(POLLDATA_FILENAME)) {
        try {
            manager.pollData = JSON.parse(fs.readFileSync(POLLDATA_FILENAME));
        } catch (e) {
            log.verbose("polldata is corrupt: " + e);
        }
    }

    queue.register(Automatic);

    manager.on('pollData', savePollData);
    manager.on('newOffer', handleOffer);
    manager.on('receivedOfferChanged', offerChanged);
    manager.on('sentOfferChanged', offerChanged);
};

exports.init = function() {
    ready = true;

    // Start offer checker.
    checkOfferCount();
    setInterval(checkOfferCount, 3 * 60 * 1000);

    organizeQueue();
};

exports.checkOfferCount = checkOfferCount;

function organizeQueue() {
    if (received.length === 0) {
        handleQueue();
        return;
    }

    for (let i = 0; i < received.length; i++) {
        let tradeoffer = received[i];
        handleOffer(tradeoffer);
    }
}

function handleOffer(tradeoffer) {
    if (!ready) {
        received.push(tradeoffer);
        return;
    }

    log.debug("Handling received offer...");

    const offer = new Offer(tradeoffer);
    if (offer.isGlitched()) {
        offer.log("warn", `received from ${offer.partnerID64()} is glitched (Steam might be down).`);
        return;
    }

    offer.log("info", `received from ${offer.partnerID64()}`);

    if (offer.fromOwner()) {
        offer.log("info", `is from owner, accepting.`);
        Automatic.alert("trade", "Offer from owner, accepting.");

        offer.accept().then(function (status) {
            offer.log("trade", 'successfully accepted' + ( status == 'pending' ? '; confirmation required' : '' ));
        }).catch(function (err) {
            offer.log("warn", `could not be accepted: ${err}`);
        });
        return;
    }

    if (offer.isOneSided()) {
        if (offer.isGiftOffer() && config.get('acceptGifts') == true) {
            offer.log("info", `is a gift offer asking for nothing in return, accepting.`);
            Automatic.alert("trade", "Gift offer asking for nothing in return, accepting.");

            offer.accept().then(function (status) {
                offer.log("trade", 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
            }).catch(function(err) {
                offer.log("warn", `could not be accepted: ${err}`);
            });
        } else {
            offer.log("info", "is a gift offer, declining.");
            Automatic.alert("trade", "Gift offer, declining.");

            offer.decline().then(function() {
                offer.log("debug", "declined");
            });
        }
        return;
    }

    if (offer.games.length !== 1 || offer.games[0] !== 440) {
        offer.log("info", `contains non-TF2 items (${offer.games.join(', ')}), declining.`);
        Automatic.alert("trade", `Contains non-TF2 items, declining.`);
        Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "The offer contains non-TF2 items" });

        offer.decline().then(function () {
            offer.log("debug", "declined");
        });
        return;
    }

    addItemsInTrade(offer.items.our);

    queue.receivedOffer(offer);
    if (!doingQueue) {
        handleQueue();
    }
}

function handleQueue() {
    // We are now doing stuff.
    doingQueue = true;

    let offer = queue.getNext();
    if (offer == null) {
        // Did not find an offer in the queue. We do not need to retry later because when new offers are added, this function will be called.
        log.debug("Did not find any offers in the queue.");
        doingQueue = false;
        return;
    }

    log.debug("Found an offer in the queue, processing it now.");
    if (offer.status === 'Received') {
        log.info("Handling received offer (#" + offer.id + ")");
        checkReceivedOffer(offer.id, function(err, removeFromQueue) {
            if (removeFromQueue) {
                queue.removeFirst();
            }
            doingQueue = false;

            if (err) {
                log.warn("Failed to read offer (" + err.message + ")");
                setTimeout(handleQueue, 5000);
                return;
            }

            setTimeout(handleQueue, 1000);
        });
    }
}

function checkReceivedOffer(id, callback) {
    var time = new Date().getTime();
    getOffer(id, function (err, offer) {
        log.debug("Got offer in " + (new Date().getTime() - time) + " ms");
        if (err) {
            if (err.message === "NoMatch") {
                callback(new Error("Did not find an offer with a matching id"), true);
            } else {
                callback(err);
            }
            return;
        }

        if (offer.state() != TradeOfferManager.ETradeOfferState.Active) {
            offer.log("warn", "is no longer active");
            callback(null, true);
            return;
        }

        let ok = Prices.handleBuyOrders(offer);
        if (ok === false) {
            // We will remove the offer from the queue as it will be rechecked.
            callback(null, true);
            return;
        }

        ok = Prices.handleSellOrders(offer);
        if (ok === false) {
            // We are offering items that are not in the pricelist, remove the offer from the queue.
            callback(null, true);
            return;
        }

        // Make sure that the offer does not only contain metal.
        if (offer.offeringItems.us == false && offer.offeringItems.them == false && offer.offeringKeys == false && offer.offeringKeys == false && offer.currencies.our.metal >= offer.currencies.their.metal) {
            offer.log("info", "we are both offering only metal, declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "We are both only offering metal, declining.");

            offer.decline().then(function () { offer.log("debug", "declined") });
            callback(null, true);
            return;
        }

        let our = offer.currencies.our,
            their = offer.currencies.their;
        
        const tradingKeys = (offer.offeringKeys.us == true || offer.offeringKeys.them == true) && offer.offeringItems.us == false && offer.offeringItems.them == false;
        // Allows the bot to trade keys for metal and vice versa.
        if (tradingKeys) {
            // We are buying / selling keys
            const priceObj = Prices.getPrice("Mann Co. Supply Crate Key");
            if (priceObj == null) {
                offer.log("info", "user is trying to buy / sell keys, but we are not banking them, declining. Summary:\n" + offer.summary());
                Automatic.alert("trade", "User is trying to buy / sell keys, but we are not banking them, declining. Summary: " + offer.summary());
                Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "I am not banking keys" });

                offer.decline().then(function () { offer.log("debug", "declined") });
                callback(null, true);
                return;
            }
            if (our.keys != 0) {
                our.metal = utils.addRefined(our.metal, priceObj.price.sell.metal, our.keys);
                our.keys = 0;
            }
            if (their.keys != 0) {
                their.metal = utils.addRefined(their.metal, priceObj.price.buy.metal, their.keys);
                their.keys = 0;
            }
        }

        const enough = offeringEnough(our, their, tradingKeys);
        if (enough != true) {
            offer.log("trade", "is not offering enough, declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "User is not offering enough, declining. Summary:\n" + offer.summary());
            Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You are not offering enough (missing " + utils.currencyAsText(enough.missing) + ")" });

            offer.decline().then(function () { offer.log("debug", "declined") });
            callback(null, true);
            return;
        }

        Backpack.isBanned(offer.partnerID64(), function (err, banned, reason) {
            if (err) {
                callback(err);
                return;
            } else if (banned) {
                offer.log("info", "user is " + reason + ", declining.");
                Automatic.alert("trade", "User is " + reason + ", declining.");
                Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You are " + reason });
                
                offer.decline().then(function () { offer.log("debug", "declined") });
                callback(null, true);
                return;
            }

            finalizeOffer(offer);
            // We are done reading the offer, we will check the next if there is any.
            callback(null, true);
        });
    });
}

function finalizeOffer(offer) {
    checkEscrow(offer).then(function (escrow) {
        if (!escrow) {
            acceptOffer(offer);
        }
    }).catch(function(err) {
        if (err.message === "This trade offer is no longer valid") {
            offer.log("warn", "Cannot check escrow duration because offer is no longer available");
            return;
        }
        
        if (err.message === "Not Logged In") {
            client.webLogOn();
            offer.log("warn", "Cannot check escrow duration because we are not logged into Steam, retrying in 10 seconds.")
        } else {
            offer.log("warn", "Cannot check escrow duration (error: " + err.message + "), retrying in 10 seconds.");
        }

        setTimeout(function() {
            finalizeOffer(offer);
        }, 10 * 1000);
    });
}

function acceptOffer(offer) {
    const summary = offer.summary();
    offer.log("trade", "is offering enough, accepting. Summary:\n" + summary);
    Automatic.alert("trade", "User is offering enough, accepting. Summary:\n" + summary);

    offer.accept().then(function (status) {
        offer.log("trade", 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
    }).catch(function (err) {
        offer.log("warn", "could not be accepted: " + err);
    });
}

function offeringEnough(our, their, tradingKeys = false) {
    let keyValue = utils.refinedToScrap(Prices.key());

    let ourValue = utils.refinedToScrap(our.metal) + our.keys * keyValue,
        theirValue = utils.refinedToScrap(their.metal) + their.keys * keyValue;

    if (theirValue >= ourValue) {
        return true;
    }

    let givenKeys = 0,
        reqKeys = 0;
    
    let givenMetal,
        reqMetal;

    // quick mafs
    if (!tradingKeys) {
        givenMetal = utils.scrapToRefined(theirValue - givenKeys * keyValue);
        reqMetal = utils.scrapToRefined(ourValue - reqKeys * keyValue);
    } else {
        givenMetal = utils.scrapToRefined(theirValue);
        reqMetal = utils.scrapToRefined(ourValue);
    }

    let missing = utils.scrapToRefined(ourValue - theirValue);

    return {
        given: {
            keys: givenKeys,
            metal: givenMetal
        },
        required: {
            keys: reqKeys,
            metal: reqMetal
        },
        missing: {
            metal: missing
        }
    };
}

function checkEscrow(offer) {
    if (config.get().acceptEscrow == true) {
        return Promise.resolve(false);
    }

    return offer.determineEscrowDays().then(function(escrowDays) {
        if (escrowDays != 0) {
            offer.log("info", "would be held by escrow for " + escrowDays + " " + utils.plural("day", escrowDays) + ", not accepting.");
            Automatic.alert("trade", "Offer would be held by escrow for " + escrowDays + " " + utils.plural("day", escrowDays) + ", not accepting.");
            Friends.alert(offer.partnerID64(), { type: "trade", status: "skipped", reason: "The offer would be held" });
            return true;
        }
        
        return false;
    });
}

function getOffer(id, callback) {
    manager.getOffer(id, function(err, tradeoffer) {
        if (err) {
            callback(err);
            return;
        }

        const offer = new Offer(tradeoffer);
        callback(null, offer);
    });
}

function offerChanged(offer, oldState) {
    log.verbose("Offer #" + offer.id + " state changed: " + TradeOfferManager.ETradeOfferState[oldState] + " -> " + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        queue.removeID(offer.id);

        // Remove assetids from inTrade array.
        filterItemsInTrade(offer.itemsToGive);
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        offerAccepted(offer);
    }
}

// This function will be used to update our inventory without requesting the inventory
function offerAccepted(offer) {
    offer.getReceivedItems(true, function(err, receivedItems) {
        if (err) {
            log.warn("Failed to get received items from offer, retrying in 30 seconds...");
            if (err.message == "Not Logged In") {
                client.webLogOn();
            }
            setTimeout(function() {
                offerAccepted(offer);
            }, 30 * 1000);
            return;
        }

        // Filter out items that we lost in the offer
        let inv = filterLostItems(offer.itemsToGive);
        // Add the items to the array that we received
        inv = inv.concat(receivedItems);
        // Update inventory.
        Inventory.save(inv);

        offer.itemsToGive.forEach(function(item) {
            // Get a tf2-like item from the item that we offered in the trade. This will be used to update buy orders.
            item = Items.getProperItem(Offer.getItem(item));
            Backpack.updateOrders(item, false); // We lost this item = false
        });

        receivedItems.forEach(function(item) {
            const id = item.assetid;
            item = Items.getProperItem(Offer.getItem(item));
            item.id = id;
            Backpack.updateOrders(item, true); // We gained this item = true
        });
    });
}

function addItemsInTrade(items) {
    for (let i = 0; i < items.length; i++) {
        const assetid = items[i].assetid;
        if (!inTrade.includes(assetid)) {
            inTrade.push(assetid);
        }
    }
}

function filterItemsInTrade(items) {
    for (let i = 0; i < items.length; i++) {
        const assetid = items[i].assetid;

        const index = inTrade.indexOf(assetid);
        if (index != -1) {
            inTrade.splice(index, 1);
        }
    }
}

// Returns our inventory with the litems lost in a trade removed.
function filterLostItems(lost) {
    let inv = Inventory.get();
    
    for (let i = 0; i < lost.length; i++) {
        for (var j = inv.length - 1; j >= 0; j--) {
            if (lost[i].assetid == inv[j].assetid) {
                inv.splice(j, 1);
                break;
            }
        }
    }

    return inv;
}

function checkOfferCount() {
    if (manager.apiKey === null) {
        return;
    }

    utils.request.get({
        uri: "https://api.steampowered.com/IEconService/GetTradeOffersSummary/v1/?key=" + manager.apiKey,
        gzip: true,
        json: true
    }, function (err, body) {
        if (err) {
            log.warn('Cannot get trade offer count: malformed response');
            log.debug('apiKey used: ' + manager.apiKey);
            return;
        }

        let received = body.response.pending_received_count,
            sent = body.response.pending_sent_count,
            escrow_received = body.response.escrow_received_count,
            escrow_sent = body.response.escrow_sent_count;

        log.verbose(`${received} incoming ${utils.plural('offer', received)} (${escrow_received} on hold), ${sent} sent ${utils.plural('offer', sent)} (${escrow_sent} on hold)`);
    });
}

function savePollData(pollData) {
    fs.writeFile(POLLDATA_FILENAME, JSON.stringify(pollData), function (err) {
        if (err) {
            log.warn("Error writing poll data: " + err);
        }
    });
}

function trunc(n) { return Math.floor(n * 100) / 100; }