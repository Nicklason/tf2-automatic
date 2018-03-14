const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('graceful-fs');

const utils = require('./utils.js');
const Offer = require('./offer.js');
const Queue = require('./queue.js');
const confirmations = require('./confirmations.js');

let Automatic, manager, Prices, Items, log, config;

const POLLDATA_FILENAME = 'temp/polldata.json';

let ready = false, received = [], doingQueue = false, inTrade = [], activeOffers = [];

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

    Queue.register(Automatic);

    manager.on('pollData', savePollData);
    manager.on('newOffer', handleOffer);
    manager.on('receivedOfferChanged', receivedOfferChanged);
    manager.on('sentOfferChanged', sentOfferChanged);
};

exports.init = function() {
    ready = true;

    // Start offer checker.
    checkOfferCount();
    setInterval(checkOfferCount, 3 * 60 * 1000);

    organizeQueue();
};

exports.checkOfferCount = checkOfferCount;
exports.requestOffer = requestOffer;

function requestOffer(steamID64, priceObj, amount, selling) {
    if (!Friends.isFriend(steamID64)) {
        log.debug("Not friends with user, but user tried to request a trade (" + steamID64 + ")");
        return;
    }


    // todo: get active offers and check if the steamid is in one of them

    const hasOffer = activeOffers.indexOf(steamID64) != -1;
    if (hasOffer) {
        // Todo: send them link for the active offer
        client.chatMessage(steamID64, "You already have an active offer! Please finish it before requesting a new one.");
        return;
    }

    const position = Queue.inQueue(steamID64);
    if (position != false) {
        if (position == 1) {
            client.chatMessage(steamID64, "You are already in the queue! Please wait while I process your offer.");
        } else {
            client.chatMessage(steamID64, "You are already in the queue! Please wait your turn, you are number " + position + ".");
        }
        return;
    }

    const details = {
        name: priceObj.item.name,
        amount: amount,
        price: priceObj.price[selling == true ? 'sell' : 'buy'],
        intent: selling == true ? 1 : 0
    };
    
    const length = Queue.getLength();
    Queue.requestedOffer(steamID64, details);
    if (length > 0) {
        // > 0 because we don't want to spam with messages if they are the first in the queue.
        client.chatMessage(steamID64, "You have been added to the queue. You are number " + (length + 1) + ".");
    }
    handleQueue();
}

function organizeQueue() {
    handleQueue();

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

    Queue.receivedOffer(offer);
    handleQueue();
}

function handleQueue() {
    if (doingQueue) {
        return;
    }
    doingQueue = true;

    let offer = Queue.getNext();
    if (offer == null) {
        log.debug("Did not find any offers in the queue.");
        doingQueue = false;
        return;
    }

    log.debug("Found an offer in the queue, processing it now.");
    if (offer.status === 'Received') {
        log.info("Handling received offer (#" + offer.id + ")");
        checkReceivedOffer(offer.id, function(err) {
            Queue.removeFirst();
            doingQueue = false;

            if (err) {
                log.warn("Failed to read offer (" + err.message + ")");
                setTimeout(handleQueue, 5000);
                return;
            }

            setTimeout(handleQueue, 1000);
        });
    } else if (offer.status === 'Queued') {
        log.info("Handling requested offer from " + offer.partner);
        createOffer(offer, function (err, made, reason, offerid) {
            Queue.removeFirst();
            doingQueue = false;

            if (err) {
                // Todo: tell user the error message?
                log.warn("Failed to create offer (" + err.message + ")");
                log.debug(err.stack);
                client.chatMessage(offer.partner, "Ohh nooooes! It looks like an error occurred, that\'s all we know. Please try again later!");
                setTimeout(handleQueue, 5000);
                return;
            }

            if (!made) {
                log.warn("Failed to make the offer (" + reason + ")");
                client.chatMessage(offer.partner, "I failed to make the offer. Reason: " + reason + ".");
            } else if (offerid) {
                client.chatMessage(offer.partner, "The offer is now active! You can accept it here: https://steamcommunity.com/tradeoffer/" + offerid + "/");
            } else {
                client.chatMessage(offer.partner, "Your offer has been made, please wait while I accept the mobile confirmation.");
            }

            setTimeout(handleQueue, 1000);
        });
    }
}

function createOffer(request, callback) {
    const selling = request.details.intent == 1;
    const partner = request.partner;

    const name = request.details.name;
    // Get price of the item in scrap.
    let price = Prices.calculatePrice(request.details.price, 1, name != "Mann Co. Supply Crate Key");
    let amount = request.details.amount;

    const seller = request.details.intent == 1 ? Automatic.getOwnSteamID() : partner;
    const buyer = request.details.intent == 0 ? Automatic.getOwnSteamID() : partner;

    // Check if the seller has the item(s) - Lower the amount if needed.
    // Check if the buyer can afford the item - Lower the amount if needed.
    // Check for escrow
    // Check if the user is banned on sr / bptf
    // Send offer

    Inventory.getInventory(seller, function(err, sellerDict) {
        if (err) {
            callback(err);
            return;
        }

        let alteredMessage;

        var inInv = sellerDict.hasOwnProperty(name) ? sellerDict[name].length : 0;
        if (amount > inInv) {
            if (inInv == 0) {
                callback(null, false, (selling ? 'I' : 'You') + ' don\'t have any ' + name + '(s) in ' + (selling ? 'my' : 'your') + ' inventory');
                return;
            } else {
                alteredMessage = 'Your offer has been altered! Reason: ' + (selling ? 'I' : 'You') + ' only have ' + inInv + ' ' + name + (inInv > 1 ? '(s)' : '') + " in " + (selling ? 'my' : 'your') + ' inventory.'
                amount = inInv;
            }
        }

        Inventory.getInventory(buyer, function(err, buyerDict) {
            if (err) {
                callback(err);
                return;
            }

            if (selling == false) {
                const limit = config.getLimit(name);
                if (limit != -1) {
                    const stock = Inventory.getAmount(name);
                    const canBuy = limit - stock;

                    if (canBuy <= 0) {
                        callback(null, false, 'I am overstocked on ' + name + '(s), I won\'t keep more than ' + limit + ' in my inventory');
                        // Remove buy order as we are overstocked on the item.
                        let listing = Backpack.findBuyOrder(name);
                        if (listing) {
                            Backpack.removeListing(listing.id);
                        }
                        return;
                    } else if (canBuy - amount < 0) {
                        alteredMessage = 'Your offer has been altered! Reason: I can only keep ' + canBuy + ' more.';
                        amount = canBuy;
                    }
                }
            }

            const buyerPure = Inventory.getPure(buyerDict, name != "Mann Co. Supply Crate Key");
            log.debug("The buyer has", buyerPure);
            const canAfford = Prices.canAfford(price.value, buyerPure.value);
            log.debug("The buyer can afford " + canAfford + " of the item");
            if (canAfford == 0) {
                callback(null, false, (selling ? 'You' : 'I') + ' don\'t have enough pure');
                return;
            } else if (canAfford < amount) {
                alteredMessage = 'Your offer has been altered! Reason: ' + (selling ? 'You' : 'I') + ' can only afford afford ' + canAfford + '.';
                amount = canAfford;
            }

            if (alteredMessage) {
                client.chatMessage(partner, alteredMessage);
            }

            // Get the value of all the items -> { value, keys, metal }
            price = Prices.calculatePrice(price, amount, name != "Mann Co. Supply Crate Key");
            const priceText = utils.currencyAsText(price);
            client.chatMessage(partner, 'Please wait while I process your offer! You will be offered ' + (selling ? amount + ' ' + name + (amount > 1 ? '(s)' : '') + " for your " + priceText : priceText + ' for your ' + amount + ' ' + name + (amount > 1 ? '(s)' : '')) + '.');

            // make offer

            // If this is false, then just fill out with metal. If it is true, then use the values given
            let items = constructOffer(price.value, buyerDict, name != "Mann Co. Supply Crate Key");

            const offer = manager.createOffer(partner);

            // this can only work because the object is always ordered so that the keys are first, then refined, reclaimed, and lastly scrap.
            for (let item in items) {
                if (item == "change") {
                    continue;
                }

                let actualName = item;
                switch (item) {
                    case "keys":
                        actualName = "Mann Co. Supply Crate Key";
                        break;
                    case "refined":
                        actualName = "Refined Metal";
                        break;
                    case "reclaimed":
                        actualName = "Reclaimed Metal";
                        break;
                    case "scrap":
                        actualName = "Scrap Metal";
                        break;
                }

                const ids = buyerDict[actualName] || [];
                for (let i = 0; i < ids.length; i++) {
                    if (items[item] == 0) {
                        break;
                    }

                    const id = ids[i];
                    if (inTrade.includes(id)) {
                        continue;
                    }

                    const added = offer[selling ? "addTheirItem" : "addMyItem" ]({
                        appid: 440,
                        contextid: 2,
                        assetid: id,
                        amount: 1
                    });

                    if (added) {
                        items[item]--;
                    }
                }
            }

            let missing = false;
            for (let item in items) {
                if (item == "change") {
                    continue;
                }

                if (items[item] != 0) {
                    missing = true;
                    break;
                }
            }

            if (missing) {
                log.debug("Items missing:", items);
                callback(null, false, 'Something went wrong constructing the offer');
                return;
            }

            let missingItems = amount;
            for (let i = 0; i < sellerDict[name].length; i++) {
                if (missingItems == 0) {
                    break;
                }

                const id = sellerDict[name][i];
                if (inTrade.includes(id)) {
                    continue;
                }

                const added = offer[!selling ? "addTheirItem" : "addMyItem"]({
                    appid: 440,
                    contextid: 2,
                    assetid: id,
                    amount: 1
                });

                if (added) {
                    missingItems--;
                }
            }

            if (missingItems != 0) {
                callback(null, false, 'Something went wrong constructing the offer' + (selling ? ', I might already be selling the ' + utils.plural('item', amount) : ''));
                return;
            }

            if (items.change && items.change != 0) {
                const keyValue = utils.refinedToScrap(Prices.key());
                const refined = sellerDict["Refined Metal"] || [];
                for (let i = 0; i < refined.length; i++) {
                    if (items.change == 0 || items.change < 9) {
                        break;
                    }

                    const id = refined[i];
                    const added = offer[!selling ? "addTheirItem" : "addMyItem"]({
                        appid: 440,
                        contextid: 2,
                        assetid: id,
                        amount: 1
                    });

                    if (added) {
                        items.change -= 9;
                    }
                }
                const reclaimed = sellerDict["Reclaimed Metal"] || [];
                for (let i = 0; i < reclaimed.length; i++) {
                    if (items.change == 0 || items.change < 3) {
                        break;
                    }
                    const id = reclaimed[i];
                    const added = offer[!selling ? "addTheirItem" : "addMyItem"]({
                        appid: 440,
                        contextid: 2,
                        assetid: id,
                        amount: 1
                    });

                    if (added) {
                        items.change-=3;
                    }
                }

                const scrap = sellerDict["Scrap Metal"] || [];
                for (let i = 0; i < scrap.length; i++) {
                    if (items.change == 0) {
                        break;
                    }
                    const id = scrap[i];
                    const added = offer[!selling ? "addTheirItem" : "addMyItem"]({
                        appid: 440,
                        contextid: 2,
                        assetid: id,
                        amount: 1
                    });

                    if (added) {
                        items.change--;
                    }
                }

                if (items.change != 0) {
                    log.debug("Missing change: " + utils.scrapToRefined(items.change));
                    callback(null, false, (selling ? 'I am' : 'You are') + ' missing change' + (selling ? ', I might already be trading my metal' : ''));
                    return;
                }
            }

            offer.setMessage("Thank you my dude!");

            // check escrow and banned.

            log.debug("Offer ready, checking if the user is banned...");
            Backpack.isBanned(partner, function (err, banned, reason) {
                if (err) {
                    callback(err);
                    return;
                } else if (banned) {
                    log.info("user is " + reason + ", declining.");
                    callback(null, false, "You are " + reason);
                    return;
                }

                log.debug("Finishing the offer");
                finalizeOffer(offer, callback);
            });
        });
    });
}

function finalizeOffer(offer, callback) {
    log.debug("Finalizing offer");
    log.debug(callback != undefined ? "Offer was requested" : "Offer was received");
    const time = new Date().getTime();
    checkEscrow(callback ? offer : offer.offer).then(function (escrow) {
        log.debug("Got escrow response in " + (new Date().getTime() - time) + " ms");
        if (!escrow) {
            if (callback) {
                sendOffer(offer, callback);
            } else {
                acceptOffer(offer);
            }
        } else if (!callback) {
            log.info("Offer would be held by escrow, declining.");
            offer.decline().then(function () { offer.log("debug", "declined") });
        }
    }).catch(function (err) {
        log.debug("Got escrow response in " + (new Date().getTime() - time) + " ms");

        log.debug("Failed to check for escrow for offer");
        log.debug(err.stack);
        if (err.message.indexOf("offer is no longer valid") != -1) {
            // Only error when receiving offers
            log.warn("Cannot check escrow duration because offer is no longer available");
            return;
        }

        // Only error when sending offers
        if (err.message.indexOf("can only be sent to friends") != -1) {
            callback(err);
            return;
        } else if (err.message.indexOf("because they have a trade ban") != -1) {
            callback(err);
            return;
        }

        if (err.message == "Not Logged In") {
            client.webLogOn();
            log.warn("Cannot check escrow duration because we are not logged into Steam, retrying in 10 seconds.")
        } else {
            log.warn("Cannot check escrow duration (error: " + err.message + "), retrying in 10 seconds.");
        }

        setTimeout(function () {
            finalizeOffer(offer, callback);
        }, 10 * 1000);
    });
}

function sendOffer(offer, callback) {
    offer.send(function (err, status) {
        if (err) {
            log.debug("Failed to send the offer");
            log.debug(err.stack);
            
            if (err.message.indexOf("can only be sent to friends") != -1) {
                callback(err);
                return;
            } else if (err.message.indexOf('maximum number of items allowed in your Team Fortress 2 inventory') > -1) {
                callback(null, false, 'I don\'t have space for more items in my inventory');
                return;
            } else if (err.hasOwnProperty('eresult')) {
                if (err.eresult == 26) {
                    // Updating our inventory as this could possibly be because of the inventory being out of date
                    // This does have the possibility of giving other problems, like multiple items of the same kind in the inventory
                    Inventory.getOwn(true, function() {});
                    callback(null, false, 'One or more of the items in the offer has been traded away');
                } else {
                    callback(null, false, 'Error occurred sending the offer (' + err.eresult + ')');
                }
                return;
            }
            
            if (err.message == 'Not Logged In') {
                client.webLogOn();
            } else {
                log.warn("An error occurred while trying to send the offer, retrying in 10 seconds.");
            }

            setTimeout(function () {
                sendOffer(offer, callback);
            }, 10000);
            return;
        }

        addItemsInTrade(offer.itemsToGive);

        if (status === 'pending') {
            // todo: notify the user when the confirmation has been accepted and give them the link to the offer
            callback(null, true);
            confirmations.accept(offer.id);
        } else {
            callback(null, true, null, offer.id);
        }
    });
}

function constructOffer(price, inventory, useKeys) {
    let pure = Inventory.getPure(inventory, true);

    // Filter out items that are already in trade, ik this is werid.
    for (let name in pure) {
        let ids = pure[name];
        for (var i = ids.length - 1; i >= 0; i--) {
            const id = ids[i];
            if (inTrade.includes(id)) {
                ids.splice(i, 1);
            }
        }
        pure[name] = ids.length || pure[name];
    }

    const needsChange = needChange(price, pure, useKeys);
    log.debug(needsChange ? "Offer needs change" : "Offer does not need change");
    if (needsChange == true) {
        return makeChange(price, pure, useKeys);
    }

    return needsChange;
}

function needChange(price, pure, useKeys) {
    const keyValue = utils.refinedToScrap(Prices.key());

    var keys = 0,
        refined = 0,
        reclaimed = 0,
        scrap = 0;

    var metalReq = price;

    if (useKeys && metalReq > keyValue) {
        keys = Math.floor(metalReq / keyValue);
        if (keys > pure.keys) {
            keys = pure.keys;
        }

        metalReq -= keyValue * keys;
    }

    if (metalReq > 8) {
        refined = Math.floor(metalReq / 9);
        if (refined > pure.refined) {
            refined = pure.refined;
        }

        metalReq -= 9 * refined;
    }

    if (metalReq > 2) {
        reclaimed = Math.floor(metalReq / 3);
        if (reclaimed > pure.reclaimed) {
            reclaimed = pure.reclaimed;
        }

        metalReq -= 3 * reclaimed;
    }

    if (metalReq > 0) {
        scrap = metalReq;
        if (scrap > pure.scrap) {
            scrap = pure.scrap;
        }

        metalReq -= scrap;
    }

    if (metalReq != 0) {
        return true;
    }

    return {
        keys: keys,
        refined: refined,
        reclaimed: reclaimed,
        scrap: scrap
    };
}

function makeChange(price, pure, useKeys) {
    const keyValue = utils.refinedToScrap(Prices.key());

    let required = Prices.valueToPure(price, useKeys);
    let change = 0;

    let availablePure = {
        keys: Array.isArray(pure.keys) ? pure.keys.length : pure.keys,
        refined: Array.isArray(pure.refined) ? pure.refined.length : pure.refined,
        reclaimed: Array.isArray(pure.reclaimed) ? pure.reclaimed.length : pure.reclaimed,
        scrap: Array.isArray(pure.scrap) ? pure.scrap.length : pure.scrap,
    };

    log.debug("The buyer has:", availablePure);
    log.debug("The required amount is:", required);

    while (availablePure.refined < required.refined) {
        if (availablePure.keys > required.keys) {
            required.keys++;

            let refined = Math.floor(keyValue / 9);
            let reclaimed = Math.floor((keyValue - refined * 9) / 3);
            let scrap = keyValue - refined * 9 - reclaimed * 3;

            required.refined -= refined;
            required.reclaimed -= reclaimed;
            required.scrap -= scrap;

            if (required.refined < 0) {
                change += Math.abs(required.refined) * 9;
                required.refined = 0;
            }
            if (required.reclaimed < 0) {
                change += Math.abs(required.reclaimed) * 3;
                required.reclaimed = 0;
            }
            if (required.scrap < 0) {
                change += Math.abs(required.reclaimed);
                required.scrap = 0;
            }
        }
    }

    while (availablePure.scrap < required.scrap) {
        required.reclaimed++;
        required.scrap -= 3;
        if (required.scrap < 0) {
            change += Math.abs(required.scrap);
            required.scrap = 0;
        }
    }

    while (availablePure.reclaimed < required.reclaimed) {
        if (availablePure.refined > required.refined) {
            required.refined++;
            required.reclaimed -= 3;
            if (required.reclaimed < 0) {
                change += Math.abs(required.reclaimed) * 3;
                required.reclaimed = 0;
            }
        } else {
            required.scrap += 3;
            required.reclaimed--;
        }
    }

    log.debug("After calculating change for the offer, the required amount is:", required);

    return {
        keys: required.keys,
        refined: required.refined,
        reclaimed: required.reclaimed,
        scrap: required.scrap,
        change: change
    };
};

function scrapToMetals(scrap) {
    var totalRef = Math.floor(scrap / 9);
    var totalRec = Math.floor((scrap - totalRef * 9) / 3);
    var totalScrap = scrap - totalRef * 9 - totalRec * 3;

    return {
        refined: totalRef,
        reclaimed: totalRec,
        scrap: totalScrap
    }
};

function checkReceivedOffer(id, callback) {
    const time = new Date().getTime();
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
            callback(null);
            return;
        }

        addItemsInTrade(offer.items.our);

        let ok = Prices.handleBuyOrders(offer);
        if (ok === false) {
            // We will remove the offer from the queue as it will be rechecked.
            callback(null);
            return;
        }

        ok = Prices.handleSellOrders(offer);
        if (ok === false) {
            // We are offering items that are not in the pricelist, remove the offer from the queue.
            callback(null);
            return;
        }

        // Make sure that the offer does not only contain metal.
        if (offer.offeringItems.us == false && offer.offeringItems.them == false && offer.offeringKeys == false && offer.offeringKeys == false && offer.currencies.our.metal >= offer.currencies.their.metal) {
            offer.log("info", "we are both offering only metal, declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "We are both only offering metal, declining.");

            offer.decline().then(function () { offer.log("debug", "declined") });
            callback(null);
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
                offer.log("info", "User is trying to buy / sell keys, but we are not banking them, declining. Summary:\n" + offer.summary());
                Automatic.alert("trade", "User is trying to buy / sell keys, but we are not banking them, declining. Summary: " + offer.summary());
                Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "I am not banking keys" });

                offer.decline().then(function () { offer.log("debug", "declined") });
                callback(null);
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
            offer.log("info", "is not offering enough, declining. Summary:\n" + offer.summary());
            Automatic.alert("trade", "User is not offering enough, declining. Summary:\n" + offer.summary());
            Friends.alert(offer.partnerID64(), { type: "trade", status: "declined", reason: "You are not offering enough" });

            offer.decline().then(function () { offer.log("debug", "declined") });
            callback(null);
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
                callback(null);
                return;
            }

            finalizeOffer(offer);
            callback(null);
        });
    });
}

function acceptOffer(offer) {
    offer.log("trade", "is offering enough, accepting. Summary:\n" + offer.summary());
    Automatic.alert("trade", "User is offering enough, accepting. Summary:\n" + offer.summary());

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

function determineEscrowDays(offer) {
    return new Promise((resolve, reject) => {
        offer.getUserDetails((err, my, them) => {
            if (err) {
                return reject(err);
            }

            const myDays = my.escrowDays;
            const theirDays = them.escrowDays;
            let escrowDays = 0;

            if (offer.itemsToReceive.length !== 0 && theirDays > escrowDays) {
                escrowDays = theirDays;
            }

            if (offer.itemsToGive.length !== 0 > 0 && myDays > escrowDays) {
                escrowDays = myDays;
            }

            resolve(escrowDays);
        });
    });
}

function checkEscrow(offer) {
    if (config.get().acceptEscrow == true) {
        return Promise.resolve(false);
    }

    log.debug("Checking escrow for offer");
    return determineEscrowDays(offer).then(function(escrowDays) {
        return escrowDays != 0;
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

function receivedOfferChanged(offer, oldState) {
    log.verbose("Offer #" + offer.id + " state changed: " + TradeOfferManager.ETradeOfferState[oldState] + " -> " + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        // Remove assetids from inTrade array.
        filterItemsInTrade(offer.itemsToGive);
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        client.chatMessage(offer.partner, "Success! The offer went through successfully.");
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Declined) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: The offer has been declined.');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: Items not available (traded away in a different trade).');
    }
}

function sentOfferChanged(offer, oldState) {
    log.verbose("Offer #" + offer.id + " state changed: " + TradeOfferManager.ETradeOfferState[oldState] + " -> " + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        // Remove assetids from inTrade array.
        filterItemsInTrade(offer.itemsToGive);
        const index = activeOffers.indexOf(offer.partner.getSteamID64());
        if (index != -1) {
            activeOffers.splice(index, 1);
        }
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        client.chatMessage(offer.partner, "Success! The offer went through successfully.");
        log.trade("Offer #" + offer.id + " User accepted the offer");
        Automatic.alert("trade", "User accepted a trade sent by me");
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Active) {
        client.chatMessage(offer.partner, "The offer is now active! You can accept it here: https://steamcommunity.com/tradeoffer/" + offer.id + "/");
        activeOffers.push(offer.partner.getSteamID64());
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Declined) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: The offer has been declined.');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: Items not available (traded away in a different trade).');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Canceled) {
        if (oldState == TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
            client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: Failed to accept mobile confirmation.');
        } else {
            client.chatMessage(offer.partner, 'Ohh nooooes! The offer is now unavailable. Reason: The offer has been pending for a while.');
        }
    }
}

// This function will be used to update our inventory without requesting the inventory
function offerAccepted(offer) {
    offer.getReceivedItems(true, function(err, receivedItems) {
        if (err) {
            log.warn("Failed to get received items from offer, retrying in 30 seconds.");
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