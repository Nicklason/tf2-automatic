const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('graceful-fs');

const utils = require('./utils.js');
const Offer = require('./offer.js');
const Queue = require('./queue.js');
const confirmations = require('./confirmations.js');

let Automatic, client, manager, Inventory, Backpack, Prices, Items, Friends, log, config;

const POLLDATA_FILENAME = 'temp/polldata.json';

let READY = false, RECEIVED = [], DOING_QUEUE = false, ITEMS_IN_TRADE = [];

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
            log.verbose('polldata is corrupt: ' + e);
        }
    }

    Queue.register(Automatic);

    manager.on('pollData', savePollData);
    manager.on('newOffer', handleOffer);
    manager.on('receivedOfferChanged', receivedOfferChanged);
    manager.on('sentOfferChanged', sentOfferChanged);
};

exports.init = function() {
    READY = true;

    // Start offer checker.
    checkOfferCount();
    setInterval(checkOfferCount, 3 * 60 * 1000);

    organizeQueue();
};

exports.checkOfferCount = checkOfferCount;
exports.requestOffer = requestOffer;

function getActiveOffer(steamID64) {
    let pollData = manager.pollData;

    if (!pollData.offerData) pollData.offerData = {};

    for (let id in pollData.sent) {
        const status = pollData.sent[id];
        if (status != TradeOfferManager.ETradeOfferState.Active) continue;
        const data = pollData.offerData[id] || null;
        if (data == null) continue;

        if (data.partner == steamID64) return id;
    }

    return null;
}

function requestOffer(steamID64, name, amount, selling) {
    if (!Friends.isFriend(steamID64)) {
        log.debug('Not friends with user, but user tried to request a trade (' + steamID64 + ')');
        return;
    }

    const active = getActiveOffer(steamID64);
    if (active != null) {
        client.chatMessage(steamID64, 'You already have an active offer! Please finish it before requesting a new one: https://steamcommunity.com/tradeoffer/' + active + '/');
        return;
    }

    const position = Queue.inQueue(steamID64);
    if (position != false) {
        if (position == 1) {
            client.chatMessage(steamID64, 'You are already in the queue! Please wait while I process your offer.');
        } else {
            client.chatMessage(steamID64, 'You are already in the queue! Please wait your turn, you are number ' + position + '.');
        }
        return;
    }

    const details = {
        name: name,
        amount: amount,
        intent: selling == true ? 1 : 0
    };
    
    const length = Queue.getLength();
    Queue.requestedOffer(steamID64, details);
    if (length > 0) {
        // > 0 because we don't want to spam with messages if they are the first in the queue.
        client.chatMessage(steamID64, 'You have been added to the queue. You are number ' + (length + 1) + '.');
    }
    handleQueue();
}

function organizeQueue() {
    handleQueue();

    for (let i = 0; i < RECEIVED.length; i++) {
        let tradeoffer = RECEIVED[i];
        handleOffer(tradeoffer);
    }
}

function handleOffer(offer) {
    if (!READY) {
        RECEIVED.push(offer);
        return;
    }

    log.debug('Handling received offer...');
    offer = new Offer(offer);

    if (offer.isGlitched()) {
        offer.log('warn', 'from ' + Offer.partner(offer) + ' is glitched (Steam might be down), skipping');
        return;
    }

    addItemsInTrade(offer.items.our);

    offer.log('info', 'received from ' + offer.partner());

    if (offer.fromOwner()) {
        offer.log('info', 'is from an owner, accepting');
        Automatic.alert('trade', 'Offer from owner, accepting');
        
        offer.accept().then(function (status) {
            offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
        }).catch(function (err) {
            offer.log('warn', `could not be accepted: ${err}`);
        });
        return;
    }

    if (offer.isOneSided()) {
        if (offer.isGift() && config.get('acceptGifts') == true) {
            offer.log('trade', 'is a gift offer asking for nothing in return, accepting');
            Automatic.alert('trade', 'Gift offer asking for nothing in return, accepting');
            
            offer.accept().then(function (status) {
                offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
            }).catch(function (err) {
                offer.log('warn', `could not be accepted: ${err}`);
            });
        } else {
            offer.log('trade', 'is a gift offer, declining');
            Automatic.alert('Gift offer, declining');

            offer.decline().then(function () {
                offer.log('debug', 'declined');
            });
        }
        return;
    }

    if (offer.games.length != 1 || offer.games[0] != 440) {
        offer.log('info', 'contains non-TF2 items, declining');
        Automatic.alert('trade', 'Contains non-TF2 items, declining');
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'The offer contains non-TF2 items' });
        
        offer.decline().then(function () {
            offer.log('debug', 'declined');
        });
        return;
    }

    Queue.receivedOffer(offer);
    handleQueue();
}

function handleQueue() {
    if (DOING_QUEUE) {
        log.debug('Already processing an offer in the queue');
        return;
    }
    DOING_QUEUE = true;

    const offer = Queue.getNext();
    if (offer == null) {
        log.debug('Did not find any offers in the queue.');
        DOING_QUEUE = false;
        return;
    }

    log.debug('Found an offer in the queue, processing it now.');
    if (offer.status === 'Received') {
        log.info('Handling received offer (#' + offer.id + ')');
        checkReceivedOffer(offer.id, function(err) {
            Queue.removeFirst();
            DOING_QUEUE = false;

            if (err) {
                log.warn('Failed to read offer (' + err.message + ')');
                setTimeout(handleQueue, 5000);
                return;
            }

            setTimeout(handleQueue, 1000);
        });
    } else if (offer.status === 'Queued') {
        log.info('Handling requested offer from ' + offer.partner);
        createOffer(offer, function (err, made, reason, offerid) {
            Queue.removeFirst();
            DOING_QUEUE = false;

            if (err) {
                log.warn('Failed to create offer (' + err.message + ')');
                log.debug(err.stack);
                client.chatMessage(offer.partner, 'Ohh nooooes! It looks like an error occurred, that\'s all we know. Please try again later!');
                setTimeout(handleQueue, 5000);
                return;
            }

            if (!made) {
                log.warn('Failed to make the offer (' + reason + ')');
                client.chatMessage(offer.partner, 'I failed to make the offer. Reason: ' + reason + '.');
            } else if (offerid) {
                client.chatMessage(offer.partner, 'The offer is now active! You can accept it here: https://steamcommunity.com/tradeoffer/' + offerid + '/');
            } else {
                client.chatMessage(offer.partner, 'Your offer has been made, please wait while I accept the mobile confirmation.');
            }

            setTimeout(handleQueue, 1000);
        });
    }
}

function hasEnoughItems(name, dictionary, amount) {
    const ids = dictionary[name] || [];
    const stock = ids.length;

    if (amount <= stock) return true;
    if (stock == 0) return false;
    return stock;
}

function isOverstocked(name, amount) {
    const limit = config.limit(name);
    if (limit == -1) return false;
    if (limit == 0) return true;

    const stock = Inventory.amount(name);
    const canBuy = limit - stock;

    if (canBuy <= 0) return true;
    if (canBuy - amount < 0) return canBuy;
    return false;
}

function filterItems(dictionary) {    
    let filtered = {};
    for (let name in dictionary) {
        // If I don't do this, the item will be removed from the dictionary - https://gyazo.com/c31c89396f651244824d06c5cd85d709
        let ids = [].concat(dictionary[name]);
        for (var i = ids.length - 1; i >= 0; i--) {
            for (let j = 0; j < ITEMS_IN_TRADE.length; j++) {
                if (ids[i] == ITEMS_IN_TRADE[j]) {
                    ids.splice(i, 1);
                    break;
                }
            }
        }
        if (ids.length != 0) {
            filtered[name] = ids;
        }
    }
    return filtered;
}

function convertPure(pure) {
    let items = {
        'Mann Co. Supply Crate Key': pure.keys,
        'Refined Metal': pure.refined,
        'Reclaimed Metal': pure.reclaimed,
        'Scrap Metal': pure.scrap
    };
    return items;
}

function createOffer(request, callback) {
    const selling = request.details.intent == 1;
    const partner = request.partner;

    const name = request.details.name;

    let price = Prices.getPrice(name);
    if (price == null) {
        callback(null, false, 'Item is no longer in the pricelist');
        return;
    }
    price = price.price[selling ? 'sell' : 'buy'];

    let required = Prices.required(price, 1, name != 'Mann Co. Supply Crate Key');

    let amount = request.details.amount;

    const seller = request.details.intent == 1 ? Automatic.getOwnSteamID() : partner;
    const buyer = request.details.intent == 0 ? Automatic.getOwnSteamID() : partner;

    Inventory.getDictionary(seller, function(err, dict) {
        if (err) {
            callback(err);
            return;
        }

        let items = {};
        items.seller = selling == true ? filterItems(dict) : dict;

        let alteredMessage;

        const enoughItems = hasEnoughItems(name, items.seller, amount);
        if (enoughItems == false) {
            if (selling == true) {
                const inInv = Inventory.amount(name);
                if (inInv != 0) {
                    callback(null, false, 'I am already trading my ' + name + '(s)');
                    return;
                }
            }

            callback(null, false, (selling ? 'I' : 'You') + ' don\'t have any ' + name + '(s) in ' + (selling ? 'my' : 'your') + ' inventory');
            return;
        } else if (typeof enoughItems != 'boolean') {
            if (selling == true) {
                alteredMessage = 'I only have ' + enoughItems + ' ' + name + (enoughItems > 1 ? '(s)' : '') + ' for trade';
            } else{
                alteredMessage = (selling ? 'I' : 'You') + ' only have ' + enoughItems + ' ' + name + (enoughItems > 1 ? '(s)' : '') + ' in ' + (selling ? 'my' : 'your') + ' inventory.';
            }
            amount = enoughItems;
        }

        if (selling == false) {
            const overstocked = isOverstocked(name);
            if (overstocked == true) {
                callback(null, false, 'I am overstocked on ' + name + '(s)');

                const listing = Backpack.findBuyOrder(name);
                if (listing) Backpack.removeListing(listing.id);
                return;
            } else if (typeof overstocked != 'boolean') {
                alteredMessage = 'I can only keep ' + overstocked + ' more ' + name + (overstocked != 1 ? '(s)' : '');
                amount = overstocked;
            }
        }

        Inventory.getDictionary(buyer, function(err, dict) {
            if (err) {
                callback(err);
                return;
            }

            if (selling == false) {
                const limit = config.limit(name);
                if (limit != -1) {
                    const stock = Inventory.amount(name);
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

            items.buyer = selling == false ? filterItems(dict) : dict;
            const afford = Prices.afford(required, Items.pure(items.buyer, name != 'Mann Co. Supply Crate Key'));

            if (afford == 0) {
                callback(null, false, (selling ? 'You' : 'I') + ' don\'t have enough pure');
                return;
            } else if (afford < amount) {
                alteredMessage = (selling ? 'You' : 'I') + ' can only afford ' + afford + ' ' + name + (afford != 1 ? '(s)' : '');
                amount = afford;
            }

            if (alteredMessage) {
                client.chatMessage(partner, 'Your offer has been altered! Reason: ' + alteredMessage);
            }

            required = Prices.required(required, amount, name != 'Mann Co. Supply Crate Key');
            const priceText = utils.currencyAsText(required);
            client.chatMessage(partner, 'Please wait while I process your offer! You will be offered ' + (selling ? amount + ' ' + name + (amount > 1 ? '(s)' : '') + ' for your ' + priceText : priceText + ' for your ' + amount + ' ' + name + (amount > 1 ? '(s)' : '')) + '.');

            let pure = constructOffer(required, items.buyer, name != 'Mann Co. Supply Crate Key');
            const offer = manager.createOffer(partner);

            let change = pure.change || 0;
            pure = convertPure(pure);
            
            for (let name in pure) {
                const ids = items.buyer[name] || [];
                for (let i = 0; i < ids.length; i++) {
                    if (pure[name] == 0) break;

                    const added = offer[selling == true ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: ids[i], amount: 1 });
                    if (added) pure[name]--;
                }
            }

            let missing = false;
            for (let name in pure) {
                if (pure[name] != 0) {
                    missing = true;
                    break;
                }
            }

            if (missing == true) {
                log.debug('Items missing:', items);
                callback(null, false, 'Something went wrong constructing the offer');
                return;
            }

            let missingItems = amount;
            for (let i = 0; i < items.seller[name].length; i++) {
                if (missingItems == 0) break;
                const added = offer[selling == false ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: items.seller[name][i], amount: 1 });
                if (added) missingItems--;
            }

            if (missingItems != 0) {
                callback(null, false, 'Something went wrong constructing the offer' + (selling ? ', I might already be selling the ' + utils.plural('item', amount) : ''));
                return;
            }

            if (change != 0) {
                const refined = items.seller['Refined Metal'] || [];
                for (let i = 0; i < refined.length; i++) {
                    if (change == 0 || change < 9) break;
                    const added = offer[selling == false ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: refined[i], amount: 1 });
                    if (added) change -= 9;
                }
                const reclaimed = items.seller['Reclaimed Metal'] || [];
                for (let i = 0; i < reclaimed.length; i++) {
                    if (change == 0 || change < 3) break;
                    const added = offer[selling == false ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: reclaimed[i], amount: 1 });
                    if (added) change -= 3;
                }
                const scrap = items.seller['Scrap Metal'] || [];
                for (let i = 0; i < scrap.length; i++) {
                    if (change == 0) break;
                    const added = offer[selling == false ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: scrap[i], amount: 1 });
                    if (added) change -= 1;
                }

                if (change != 0) {
                    log.debug('Missing change: ' + utils.scrapToRefined(change));
                    callback(null, false, 'I am missing ' + utils.scrapToRefined(change) + ' ref as change');
                    return;
                }
            }

            offer.setMessage(config.get('offerMessage'));

            log.debug('Offer ready, checking if the user is banned...');
            Backpack.isBanned(partner, function (err, banned, reason) {
                if (err) {
                    callback(err);
                    return;
                } else if (banned) {
                    log.info('user is ' + reason + ', declining.');
                    callback(null, false, 'You are ' + reason);
                    return;
                }

                log.debug('Finishing the offer');
                finalizeOffer(offer, callback);
            });
        });
    });
}

function finalizeOffer(offer, callback) {
    log.debug('Finalizing offer');
    log.debug(callback != undefined ? 'Offer was requested' : 'Offer was received');
    const time = new Date().getTime();
    checkEscrow(callback ? offer : offer.offer).then(function (escrow) {
        log.debug('Got escrow response in ' + (new Date().getTime() - time) + ' ms');
        if (!escrow) {
            if (callback) {
                sendOffer(offer, callback);
            } else {
                acceptOffer(offer);
            }
        } else {
            if (callback) {
                callback(null, false, 'The offer would be held by escrow');
            } else {
                log.info('Offer would be held by escrow, declining.');
                offer.decline().then(function () { offer.log('debug', 'declined'); });
            }
        }
    }).catch(function (err) {
        log.debug('Got escrow response in ' + (new Date().getTime() - time) + ' ms');

        log.debug('Failed to check for escrow for offer');
        log.debug(err.stack);
        if (err.message.indexOf('offer is no longer valid') != -1) {
            log.warn('Cannot check escrow duration because offer is no longer available');
            return;
        }

        if (err.message.indexOf('can only be sent to friends') != -1) {
            callback(err);
            return;
        } else if (err.message.indexOf('because they have a trade ban') != -1) {
            callback(null, false, 'You are trade banned');
            return;
        } else if (err.message.indexOf('is not available to trade') != -1) {
            callback(null, false, 'We can\'t trade (more information will be shown if you try and send an offer)');
            return;
        }

        if (err.message == 'Not Logged In') {
            client.webLogOn();
            log.warn('Cannot check escrow duration because we are not logged into Steam, retrying in 10 seconds.');
        } else {
            log.warn('Cannot check escrow duration (error: ' + err.message + '), retrying in 10 seconds.');
        }

        setTimeout(function () {
            finalizeOffer(offer, callback);
        }, 10 * 1000);
    });
}

function sendOffer(offer, callback) {
    offer.send(function (err, status) {
        if (err) {
            log.debug('Failed to send the offer');
            log.debug(err.stack);
            
            if (err.message.indexOf('can only be sent to friends') != -1) {
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
                log.warn('An error occurred while trying to send the offer, retrying in 10 seconds.');
            }

            setTimeout(function () {
                sendOffer(offer, callback);
            }, 10000);
            return;
        }
        
        addItemsInTrade(offer.itemsToGive);

        if (status === 'pending') {
            callback(null, true);
            confirmations.accept(offer.id);
        } else {
            callback(null, true, null, offer.id);
        }
    });
}

function constructOffer(price, dictionary, useKeys) {
    price = Prices.value(price);
    let pure = Items.createSummary(Items.pure(dictionary));

    const needsChange = needChange(price, pure, useKeys);
    log.debug(needsChange ? 'Offer needs change' : 'Offer does not need change');
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

    log.debug('The buyer has:', availablePure);
    log.debug('The required amount is:', required);

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

    log.debug('After calculating change for the offer, the required amount is:', required);

    return {
        keys: required.keys,
        refined: required.refined,
        reclaimed: required.reclaimed,
        scrap: required.scrap,
        change: change
    };
}

function overstockedItems(offer) {
    const ourSummary = Items.createSummary(Items.createDictionary(offer.items.our));
    const theirSummary = Items.createSummary(Items.createDictionary(offer.items.their));

    let change = theirSummary;
    for (let name in ourSummary) {
        change[name] = (theirSummary[name] || 0) - ourSummary[name];
    }

    for (let name in change) {
        const amount = Inventory.amount(name) + change[name];
        const limit = config.limit(name);
        if (amount > limit) return true;
    }

    return false;
}

function checkReceivedOffer(id, callback) {
    const time = new Date().getTime();
    getOffer(id, function (err, offer) {
        log.debug('Got offer in ' + (new Date().getTime() - time) + ' ms');
        if (err) {
            if (err.message === 'NoMatch') {
                callback(new Error('Did not find an offer with a matching id'), true);
            } else {
                callback(err);
            }
            return;
        }

        if (offer.state() != TradeOfferManager.ETradeOfferState.Active) {
            offer.log('warn', 'is no longer active');
            callback(null);
            return;
        }

        let ok = Prices.handleBuyOrders(offer);
        if (ok === false) {
            offer.log('info', 'contains an item that is not in the pricelist, declining. Summary:\n' + offer.summary());
            Automatic.alert('trade', 'Contains an item that is not in the pricelist, declining. Summary:\n' + offer.summary());
            Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are offering an item that is not in my pricelist' });

            offer.decline().then(function () {
                offer.log('debug', 'declined');
            });
            callback(null);
            return;
        }

        ok = Prices.handleSellOrders(offer);
        if (ok === false) {
            offer.log('info', 'contains an item that is not in the pricelist, declining. Summary:\n' + offer.summary());
            Automatic.alert('trade', 'Contains an item that is not in the pricelist, declining. Summary:\n' + offer.summary());
            Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are taking an item that is not in my pricelist' });

            offer.decline().then(function () {
                offer.log('debug', 'declined');
            });
            callback(null);
            return;
        }

        // Make sure that the offer does not only contain metal.
        if (offer.offering.items.us == false && offer.offering.items.them == false && offer.offering.keys.us == false && offer.offering.keys.them == false && offer.currencies.our.metal >= offer.currencies.their.metal) {
            offer.log('info', 'we are both offering only metal, declining. Summary:\n' + offer.summary());
            Automatic.alert('trade', 'We are both only offering metal, declining.');

            offer.decline().then(function () { offer.log('debug', 'declined'); });
            callback(null);
            return;
        }

        let our = offer.currencies.our,
            their = offer.currencies.their;

        const tradingKeys = (offer.offering.keys.us == true || offer.offering.keys.them == true) && offer.offering.items.us == false && offer.offering.items.them == false;
        // Allows the bot to trade keys for metal and vice versa.
        if (tradingKeys) {
            // We are buying / selling keys
            let price = Prices.getPrice('Mann Co. Supply Crate Key');
            if (price == null) {
                offer.log('info', 'User is trying to buy / sell keys, but we are not banking them, declining. Summary:\n' + offer.summary());
                Automatic.alert('trade', 'User is trying to buy / sell keys, but we are not banking them, declining. Summary: ' + offer.summary());
                Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'I am not banking keys' });

                offer.decline().then(function () { offer.log('debug', 'declined'); });
                callback(null);
                return;
            }

            price = price.price;
            const overstocked = isOverstocked('Mann Co. Supply Crate Key', their.keys - our.keys);

            if (overstocked) {
                offer.log('info', '"Mann Co. Supply Crate Key" is, or will be overstocked, declining. Summary:\n' + offer.summary());
                Automatic.alert('trade', 'User offered an item that is overstocked, declining. Summary:\n' + offer.summary());
                Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You offered an item that is overstocked, or more than I will keep' });

                offer.decline().then(function () { offer.log('debug', 'declined'); });
                callback(null);
                return;
            }

            if (our.keys != 0) {
                our.metal += utils.refinedToScrap(price.sell.metal) * our.keys;
                our.keys = 0;
            }
            if (their.keys != 0) {
                their.metal += utils.refinedToScrap(price.buy.metal) * their.keys;
                their.keys = 0;
            }
        }

        const enough = offeringEnough(our, their, tradingKeys);
        if (enough != true) {
            offer.log('info', 'is not offering enough, declining. Summary:\n' + offer.summary());
            Automatic.alert('trade', 'User is not offering enough, declining. Summary:\n' + offer.summary());
            Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are not offering enough' });

            offer.decline().then(function () { offer.log('debug', 'declined'); });
            callback(null);
            return;
        }

        const containsOverstocked = overstockedItems(offer);
        if (containsOverstocked) {
            offer.log('info', 'contains overstocked items, declining. Summary:\n' + offer.summary());
            Automatic.alert('trade', 'User is offering overstocked items, declining. Summary:\n' + offer.summary());
            Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are offering overstocked / too many items' });

            offer.decline().then(function () { offer.log('debug', 'declined'); });
            callback(null);
            return;
        }

        Backpack.isBanned(offer.partner(), function (err, reason) {
            if (err) {
                callback(err);
                return;
            } else if (reason) {
                offer.log('info', 'user is ' + reason + ', declining.');
                Automatic.alert('trade', 'User is ' + reason + ', declining.');
                Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are ' + reason });

                offer.decline().then(function () { offer.log('debug', 'declined'); });
                callback(null);
                return;
            }

            finalizeOffer(offer);
            callback(null);
        });
    });
}

function acceptOffer(offer) {
    offer.log('trade', 'is offering enough, accepting. Summary:\n' + offer.summary());
    Automatic.alert('trade', 'User is offering enough, accepting. Summary:\n' + offer.summary());

    offer.accept().then(function (status) {
        offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
    }).catch(function (err) {
        offer.log('warn', 'could not be accepted: ' + err);
    });
}

function offeringEnough(our, their) {
    let keyValue = utils.refinedToScrap(Prices.key());

    let ourValue = our.metal + our.keys * keyValue,
        theirValue = their.metal + their.keys * keyValue;

    if (theirValue >= ourValue) {
        return true;
    }

    const missing = utils.scrapToRefined(ourValue - theirValue);
    return missing;
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

    log.debug('Checking escrow for offer');
    return determineEscrowDays(offer).then(function(escrowDays) {
        return escrowDays != 0;
    });
}

function getOffer(id, callback) {
    manager.getOffer(id, function(err, offer) {
        if (err) {
            callback(err);
            return;
        }

        offer = new Offer(offer);
        callback(null, offer);
    });
}

function receivedOfferChanged(offer, oldState) {
    log.verbose('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        removeItemsInTrade(offer.itemsToGive);
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        client.chatMessage(offer.partner, 'Success! Your offer went through successfully.');
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        client.chatMessage(offer.partner, 'Ohh nooooes! Your offer is no longer available. Reason: Items not available (traded away in a different trade).');
    }
}

function sentOfferChanged(offer, oldState) {
    log.verbose('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        removeItemsInTrade(offer.itemsToGive);
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        client.chatMessage(offer.partner, 'Success! The offer went through successfully.');
        log.trade('Offer #' + offer.id + ' User accepted the offer');
        Automatic.alert('trade', 'User accepted a trade sent by me');
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Active) {
        addItemsInTrade(offer.itemsToGive);
        offer.data('partner', offer.partner.getSteamID64());
        client.chatMessage(offer.partner, 'The offer is now active! You can accept it here: https://steamcommunity.com/tradeoffer/' + offer.id + '/');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Declined) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: The offer has been declined.');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        client.chatMessage(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: Items not available (traded away in a different trade).');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Canceled) {
        if (oldState == TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
            client.chatMessage(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: Failed to accept mobile confirmation.');
        } else {
            client.chatMessage(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: The offer has been active for a while.');
        }
    }
}

function offerAccepted(offer) {
    offer.getReceivedItems(true, function(err, receivedItems) {
        if (err) {
            log.warn('Failed to get received items from offer, retrying in 30 seconds.');
            if (err.message == 'Not Logged In') {
                client.webLogOn();
            }
            setTimeout(function() {
                offerAccepted(offer);
            }, 30 * 1000);
            return;
        }

        let inv = filterLostItems(offer.itemsToGive);
        inv = inv.concat(receivedItems);
        Inventory.save(inv);

        offer.itemsToGive.forEach(function(item) {
            Backpack.updateOrders(item, false);
        });

        receivedItems.forEach(function(item) {
            Backpack.updateOrders(item, true);
        });
    });
}

function addItemsInTrade(items) {
    for (let i = 0; i < items.length; i++) {
        const assetid = items[i].assetid;
        if (!ITEMS_IN_TRADE.includes(assetid)) {
            ITEMS_IN_TRADE.push(assetid);
        }
    }
}

function removeItemsInTrade(items) {
    for (let i = 0; i < items.length; i++) {
        const assetid = items[i].assetid;

        const index = ITEMS_IN_TRADE.indexOf(assetid);
        if (index != -1) {
            ITEMS_IN_TRADE.splice(index, 1);
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
        uri: 'https://api.steampowered.com/IEconService/GetTradeOffersSummary/v1/?key=' + manager.apiKey,
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
    pollData = removeOldOffers(pollData);
    manager.pollData = pollData;

    fs.writeFile(POLLDATA_FILENAME, JSON.stringify(pollData), function (err) {
        if (err) {
            log.warn('Error writing poll data: ' + err);
        }
    });
}

function removeOldOffers(pollData) {
    const current = utils.epoch();
    const max = 3600; // 1 hour

    if (!pollData.hasOwnProperty('offerData')) pollData.offerData = {};

    for (let id in pollData.timestamps) {
        const time = pollData.timestamps[id];
        let state;
        if (pollData.sent[id]) state = pollData.sent[id];
        else if (pollData.received[id]) state = pollData.received[id];

        const isActive = state == TradeOfferManager.ETradeOfferState.InEscrow || state == TradeOfferManager.ETradeOfferState.Active || state == TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation;
        const old = current - time > max;
        if (!isActive && old) {
            if (pollData.sent[id]) delete pollData.sent[id];
            else if (pollData.received[id]) delete pollData.received[id];
            if (pollData.offerData[id]) delete pollData.offerData[id];
            delete pollData.timestamps[id];
        }
    }

    return pollData;
}
