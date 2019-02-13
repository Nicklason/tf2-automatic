const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('graceful-fs');
const TF2Currencies = require('tf2-currencies');
const request = require('@nicklason/api-request');


// discord
const Discord = require('discord.js');
const discordbot = new Discord.Client();
const discordbotconfig = require('./discordconfig.json');
// ^^

const utils = require('./utils.js');
const Offer = require('./offer.js');
const Queue = require('./queue.js');
const confirmations = require('./confirmations.js');

let Automatic;
let client;
let manager;
let Inventory;
let Backpack;
let Prices;
let Items;
let tf2;
let Friends;
let Statistics;
let Screenshot;
let log;
let config;

const POLLDATA_FILENAME = 'temp/polldata.json';

let READY = false;
let RECEIVED = [];
let RECEIVED_OFFER_CHANGED = [];
let SENT_OFFER_CHANGED = [];
let DOING_QUEUE = false;
const ITEMS_IN_TRADE = [];

exports.register = function (automatic) {
    Automatic = automatic;
    client = automatic.client;
    manager = automatic.manager;
    log = automatic.log;
    config = automatic.config;

    Inventory = automatic.inventory;
    Backpack = automatic.backpack;
    Prices = automatic.prices;
    Items = automatic.items;
    tf2 = automatic.tf2;
    Friends = automatic.friends;
    Statistics = automatic.statistics;
    Screenshot = automatic.screenshot;

    if (fs.existsSync(POLLDATA_FILENAME)) {
        try {
            manager.pollData = JSON.parse(fs.readFileSync(POLLDATA_FILENAME));
        } catch (err) {
            log.verbose('polldata is corrupt: ' + err);
        }
    }

    Queue.register(Automatic);

    manager.on('pollData', savePollData);
    manager.on('newOffer', handleOffer);
    manager.on('receivedOfferChanged', receivedOfferChanged);
    manager.on('sentOfferChanged', sentOfferChanged);
};

exports.init = function () {
    READY = true;

    // Start offer checker.
    checkOfferCount();
    setInterval(checkOfferCount, 3 * 60 * 1000);

    organizeQueue();
    handleChangedOffers();
};

exports.checkOfferCount = checkOfferCount;
exports.requestOffer = requestOffer;

function getActiveOffer(steamID64) {
    const pollData = manager.pollData;

    if (!pollData.offerData) pollData.offerData = {};

    for (const id in pollData.sent) {
        if (!pollData.hasOwnProperty(id)) {
            continue;
        }

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
        Automatic.message(steamID64, 'You already have an active offer! Please finish it before requesting a new one: https://steamcommunity.com/tradeoffer/' + active + '/');
        return;
    }

    const position = Queue.inQueue(steamID64);
    if (position !== false) {
        if (position == 0) {
            Automatic.message(steamID64, 'You are already in the queue! Please wait while I process your offer.');
        } else {
            Automatic.message(steamID64, 'You are already in the queue! Please wait your turn, you are number ' + position + '.');
        }
        return;
    }

    const details = {
        intent: selling == true ? 1 : 0,
        name: name,
        amount: amount
    };

    const length = Queue.getLength();
    Queue.requestedOffer(steamID64, details);
    if (length > 0) {
        // > 0 because we don't want to spam with messages if they are the first in the queue.
        Automatic.message(steamID64, 'You have been added to the queue. You are number ' + length + '.');
    }
    handleQueue();
}

function organizeQueue() {
    handleQueue();

    for (let i = 0; i < RECEIVED.length; i++) {
        const tradeoffer = RECEIVED[i];
        handleOffer(tradeoffer);
    }

    RECEIVED = [];
}

function handleChangedOffers() {
    for (let i = 0; i < RECEIVED_OFFER_CHANGED.length; i++) {
        receivedOfferChanged(RECEIVED_OFFER_CHANGED[i].offer, RECEIVED_OFFER_CHANGED[i].oldState);
    }
    RECEIVED_OFFER_CHANGED = [];
    for (let i = 0; i < SENT_OFFER_CHANGED.length; i++) {
        sentOfferChanged(SENT_OFFER_CHANGED[i].offer, SENT_OFFER_CHANGED[i].oldState);
    }
    SENT_OFFER_CHANGED = [];
}

function handleOffer(offer) {
    if (!READY) {
        RECEIVED.push(offer);
        return;
    }

    if (Automatic.running != true) {
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

        offer.accept(function (err, status) {
            if (err) {
                offer.log('warn', `could not be accepted: ${err.message}`);
                log.debug(err.stack);
            } else {
                offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
            }
        });
        return;
    }

    if (offer.isOneSided()) {
        if (offer.isGift() && config.get('acceptGifts') == true) {
            offer.log('trade', 'by ' + offer.partner() + ' is a gift offer asking for nothing in return, accepting');
            Automatic.alert('trade', 'by ' + offer.partner() + ' is a gift offer asking for nothing in return, accepting');

            offer.accept(function (err, status) {
                if (err) {
                    offer.log('warn', `could not be accepted: ${err.message}`);
                    log.debug(err.stack);
                } else {
                    offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
                }
            });
        } else {
            offer.log('trade', 'by ' + offer.partner() + ' is a gift offer, declining');
            Automatic.alert('Gift offer by ' + offer.partner() + ', declining');

            offer.decline(function () {
                offer.log('debug', 'declined');
            });
        }
        return;
    }

    if (offer.games.length != 1 || offer.games[0] != 440) {
        offer.log('info', 'contains non-TF2 items, declining');
        Automatic.alert('trade', 'Contains non-TF2 items, declining');
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'The offer contains non-TF2 items' });

        offer.decline(function () {
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
        checkReceivedOffer(offer.id, function (err) {
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
        createOffer(offer, function (err, failed, offerid) {
            Queue.removeFirst();
            DOING_QUEUE = false;

            if (err) {
                log.warn('Failed to create offer (' + err.message + ')');
                log.debug(err.stack);
                if (err.message.indexOf('This profile is private') !== -1) {
                    Automatic.message(offer.partner, 'I failed to make the offer. Reason: Your profile is private.');
                } else {
                    Automatic.message(offer.partner, 'Ohh nooooes! It looks like an error occurred. That\'s all we know, please try again later!');
                }
                setTimeout(handleQueue, 5000);
                return;
            }

            if (failed != false) {
                log.warn('Failed to make the offer (' + failed + ')');
                Automatic.message(offer.partner, 'I failed to make the offer. Reason: ' + failed + '.');
            } else if (offerid) {
                Automatic.message(offer.partner, 'Your offer is now active! You can accept it by clicking on either "View trade offer", or https://steamcommunity.com/tradeoffer/' + offerid + '/');
            } else {
                Automatic.message(offer.partner, 'Your offer has been made, please wait while I accept the mobile confirmation.');
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

function filterItems(dictionary) {
    const filtered = {};
    for (const name in dictionary) {
        if (!dictionary.hasOwnProperty(name)) {
            continue;
        }

        const ids = [].concat(dictionary[name]);
        for (let i = ids.length; i--;) {
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
    const items = {
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
        callback(null, 'Item is no longer in the pricelist');
        return;
    }

    if (!price.price.hasOwnProperty(selling ? 'sell' : 'buy')) {
        callback(null, 'I am only ' + (selling ? 'buying' : 'selling') + ' ' + name + '(s)');
        return;
    }


    price = price.price[selling ? 'sell' : 'buy'];

    const currencies = Prices.required(price, 1, name != 'Mann Co. Supply Crate Key');

    let amount = request.details.amount;

    const seller = request.details.intent == 1 ? Automatic.getOwnSteamID() : partner;
    const buyer = request.details.intent == 0 ? Automatic.getOwnSteamID() : partner;

    Inventory.getDictionary(seller, function (err, dict) {
        if (err) {
            callback(err);
            return;
        }

        const items = {};
        items.seller = selling == true ? filterItems(dict) : dict;

        let alteredMessage;

        const enoughItems = hasEnoughItems(name, items.seller, amount);
        if (enoughItems == false) {
            if (selling == true) {
                const inInv = Inventory.amount(name);
                if (inInv != 0) {
                    callback(null, 'I am already trading my ' + name + '(s)');
                    return;
                }
            }

            callback(null, (selling ? 'I' : 'You') + ' don\'t have any ' + name + '(s) in ' + (selling ? 'my' : 'your') + ' inventory');
            return;
        } else if (typeof enoughItems != 'boolean') {
            if (selling == true) {
                alteredMessage = 'I only have ' + enoughItems + ' ' + name + (enoughItems > 1 ? '(s)' : '') + ' for trade';
            } else {
                alteredMessage = (selling ? 'I' : 'You') + ' only have ' + enoughItems + ' ' + name + (enoughItems > 1 ? '(s)' : '') + ' in ' + (selling ? 'my' : 'your') + ' inventory';
            }
            amount = enoughItems;
        }

        if (selling == false) {
            const overstocked = Inventory.overstocked(name, amount);
            if (overstocked === true) {
                callback(null, 'I am overstocked on ' + name + '(s)');
                return;
            } else if (typeof overstocked != 'boolean' && overstocked - amount < 0) {
                alteredMessage = 'I can only keep ' + overstocked + ' more ' + name + (overstocked != 1 ? '(s)' : '');
                amount = overstocked;
            }
        }

        Inventory.getDictionary(buyer, function (err, dict) {
            if (err) {
                callback(err);
                return;
            }

            items.buyer = selling == false ? filterItems(dict) : dict;
            const afford = Prices.afford(currencies, Items.pure(items.buyer, name != 'Mann Co. Supply Crate Key'));

            if (afford == 0) {
                callback(null, (selling ? 'You' : 'I') + ' don\'t have enough pure');
                return;
            } else if (afford < amount) {
                alteredMessage = (selling ? 'You' : 'I') + ' can only afford ' + afford + ' ' + name + (afford != 1 ? '(s)' : '');
                amount = afford;
            }

            if (alteredMessage) {
                Automatic.message(partner, 'Your offer has been altered! Reason: ' + alteredMessage + '.');
            }

            const required = Prices.required(currencies, amount, name != 'Mann Co. Supply Crate Key');
            const priceText = utils.currencyAsText(required);
            Automatic.message(partner, 'Please wait while I process your offer! You will be offered ' + (selling ? amount + ' ' + name + (amount > 1 ? '(s)' : '') + ' for your ' + priceText : priceText + ' for your ' + amount + ' ' + name + (amount > 1 ? '(s)' : '')) + '.');

            let pure = constructOffer(required, items.buyer, name != 'Mann Co. Supply Crate Key');
            const offer = manager.createOffer(partner);

            let change = pure.change || 0;
            pure = convertPure(pure);

            for (const name in pure) {
                if (!pure.hasOwnProperty(name)) {
                    continue;
                }

                const ids = items.buyer[name] || [];
                for (let i = 0; i < ids.length; i++) {
                    if (pure[name] == 0) break;

                    const added = offer[selling == true ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: ids[i], amount: 1 });
                    if (added) pure[name]--;
                }
            }

            let missing = false;
            for (const name in pure) {
                if (pure[name] != 0) {
                    missing = true;
                    break;
                }
            }

            if (missing == true) {
                log.debug('Items missing:', items);
                callback(null, 'Something went wrong constructing the offer (missing change)');
                return;
            }

            const assetids = [];

            let missingItems = amount;
            for (let i = 0; i < items.seller[name].length; i++) {
                if (missingItems == 0) break;
                const id = items.seller[name][i];
                const added = offer[selling == false ? 'addTheirItem' : 'addMyItem']({ appid: 440, contextid: 2, assetid: id, amount: 1 });
                if (added) {
                    missingItems--;
                    assetids.push(id);
                }
            }

            if (missingItems != 0) {
                callback(null, 'Something went wrong constructing the offer' + (selling ? ', I might already be selling the ' + utils.plural('item', amount) : ''));
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
                    callback(null, 'I am missing ' + utils.scrapToRefined(change) + ' ref as change');
                    return;
                }
            }

            log.debug('Offer ready, checking if the user is banned...');
            Backpack.isBanned(partner, function (err, reason) {
                if (err) {
                    callback(err);
                    return;
                } else if (reason != false) {
                    log.info('user is ' + reason + ', declining.');
                    callback(null, 'You are ' + reason);
                    return;
                }

                offer.setMessage(config.get('offerMessage'));

                offer.data('partner', partner);
                const prices = [{
                    intent: selling == true ? 1 : 0,
                    ids: assetids,
                    name: name,
                    value: Prices.value(currencies)
                }];

                offer.data('items', prices);

                for (let i = 0; i < prices.length; i++) {
                    if (prices[i].intent != 0) {
                        continue;
                    }
                    const keys = TF2Currencies.toCurrencies(prices[i].value, Prices.key()).keys;
                    if (config.get('altcheckThreshold') < keys) {
                        altcheckOffer(offer, callback);
                        return;
                    }
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
                callback(null, 'The offer would be held by escrow');
            } else {
                log.info('Offer would be held by escrow, declining.');
                offer.decline(function () {
                    offer.log('debug', 'declined');
                });
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
            callback(null, 'You are trade banned');
            return;
        } else if (err.message.indexOf('is not available to trade') != -1) {
            callback(null, 'We can\'t trade (more information will be shown if you try and send an offer)');
            return;
        } else if (err.message.indexOf('trade offers canceled') != -1) {
            callback(null, 'We can\'t trade you because you recently had all your trade offers canceled');
            return;
        }

        if (err.message == 'Not Logged In' || err.message == 'ESOCKETTIMEDOUT') {
            Automatic.refreshSession();
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
                callback(null, 'I don\'t have space for more items in my inventory');
                return;
            } else if (err.hasOwnProperty('eresult')) {
                if (err.eresult == 10) {
                    callback(null, 'An error occurred while sending your trade offer, this is most likely because I\'ve recently accepted a big offer');
                } else if (err.eresult == 15) {
                    callback(null, 'I don\'t, or you don\'t, have space for more items');
                } else if (err.eresult == 16) {
                    // This happens when Steam is already handling an offer (usually big offers), the offer should be made
                    if (offer.id) {
                        confirmations.accept(offer.id);
                        callback(null);
                    } else {
                        callback(null, 'An error occurred while sending your trade offer, this is most likely because I\'ve recently accepted a big offer');
                    }
                } else if (err.eresult == 20) {
                    callback(null, 'Team Fortress 2\'s item server may be down or Steam may be experiencing temporary connectivity issues');
                } else if (err.eresult == 26) {
                    callback(null, 'Something went wrong while trying to send the offer, try again later');
                    Inventory.getInventory(Automatic.getOwnSteamID());
                } else {
                    callback(null, 'An error occurred while sending the offer (' + TradeOfferManager.EResult[err.eresult] + ')');
                }
                return;
            }

            if (err.message == 'Not Logged In' || err.message == 'ESOCKETTIMEDOUT') {
                Automatic.refreshSession();
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
            confirmations.accept(offer.id);
            callback(null, false);
        } else {
            callback(null, false, offer.id);
        }
    });
}

function constructOffer(price, dictionary, useKeys) {
    price = Prices.value(price);
    const pure = Items.createSummary(Items.pure(dictionary));

    const needsChange = needChange(price, pure, useKeys);
    log.debug(needsChange ? 'Offer needs change' : 'Offer does not need change');
    if (needsChange == true) {
        return makeChange(price, pure, useKeys);
    }
    return needsChange;
}

function needChange(price, pure, useKeys) {
    const keyValue = utils.refinedToScrap(Prices.key());

    let keys = 0;
    let refined = 0;
    let reclaimed = 0;
    let scrap = 0;

    let metalReq = price;

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

    const required = Prices.valueToPure(price, useKeys);
    let change = 0;

    const availablePure = {
        keys: Array.isArray(pure.keys) ? pure.keys.length : pure.keys,
        refined: Array.isArray(pure.refined) ? pure.refined.length : pure.refined,
        reclaimed: Array.isArray(pure.reclaimed) ? pure.reclaimed.length : pure.reclaimed,
        scrap: Array.isArray(pure.scrap) ? pure.scrap.length : pure.scrap
    };

    log.debug('The buyer has:', availablePure);
    log.debug('The required amount is:', required);

    while (availablePure.refined < required.refined) {
        if (availablePure.keys > required.keys) {
            required.keys++;

            const refined = Math.floor(keyValue / 9);
            const reclaimed = Math.floor((keyValue - refined * 9) / 3);
            const scrap = keyValue - refined * 9 - reclaimed * 3;

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
                change += Math.abs(required.scrap);
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

    const items = [];
    for (const name in ourSummary) {
        if (!items.includes(name)) items.push(name);
    }
    for (const name in theirSummary) {
        if (!items.includes(name)) items.push(name);
    }

    for (let i = 0; i < items.length; i++) {
        const name = items[i];

        const change = (theirSummary[name] || 0) - (ourSummary[name] || 0);
        if (change < 1) {
            continue;
        }

        const amount = Inventory.amount(name) + change;
        const limit = Prices.getLimit(name);

        if (amount > limit) {
            return true;
        }
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

        if (Prices.handleBuyOrders(offer) == false || Prices.handleSellOrders(offer) == false) {
            ERRORS.invalid_items(offer);
            callback(null);
            return;
        }

        if (offer.offering.items.us == false && offer.offering.items.them == false && offer.offering.keys.us == false && offer.offering.keys.them == false && (config.get('acceptGifts') == false && offer.currencies.our.metal >= offer.currencies.their.metal)) {
            ERRORS.only_metal(offer);
            callback(null);
            return;
        }

        const our = offer.currencies.our;
        const their = offer.currencies.their;

        /* eslint-disable-next-line max-len */
        const tradingKeys = (offer.offering.keys.us == true || offer.offering.keys.them == true) && offer.offering.items.us == false && offer.offering.items.them == false;

        // Allows the bot to trade keys for metal and vice versa.
        if (tradingKeys) {
            let price = Prices.getPrice('Mann Co. Supply Crate Key');
            if (price == null) {
                ERRORS.invalid_items(offer);
                callback(null);
                return;
            } else if (our.keys != 0 && price.intent != 2 && price.intent != 1) {
                // The user is trying to buy keys from us (we are selling), but we are not selling
                ERRORS.invalid_items(offer);
                callback(null);
                return;
            } else if (their.keys != 0 && price.intent != 2 && price.intent != 0) {
                // We are not buying keys
                ERRORS.invalid_items(offer);
                callback(null);
                return;
            }

            price = price.price;
            const overstocked = Inventory.overstocked('Mann Co. Supply Crate Key', their.keys - our.keys);

            if (overstocked == true) {
                ERRORS.overstocked(offer);
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

        const value = offeringEnough(our, their, tradingKeys);
        if (value.their < value.our) {
            ERRORS.invalid_value(offer);
            callback(null);
            return;
        }

        const containsOverstocked = overstockedItems(offer);
        if (containsOverstocked) {
            ERRORS.overstocked(offer);
            callback(null);
            return;
        }

        Backpack.isBanned(offer.partner(), function (err, reason) {
            if (err) {
                callback(err);
                return;
            } else if (reason != false) {
                if (reason.indexOf('backpack.tf') != -1) {
                    ERRORS.bptf_banned(offer);
                } else {
                    ERRORS.sr_marked(offer);
                }
                callback(null);
                return;
            }

            // ye boi
            offer.offer.data('items', offer.prices);

            callback(null);

            for (let i = 0; i < offer.prices.length; i++) {
                if (offer.prices[i].intent != 0) {
                    continue;
                }

                const keys = TF2Currencies.toCurrencies(offer.prices[i].value, Prices.key()).keys;
                if (config.get('altcheckThreshold') < keys) {
                    altcheckOffer(offer);
                    return;
                }
            }

            // no need for alt check
            finalizeOffer(offer);
        });
    });
}

function altcheckOffer(offer, callback) {
    const steamid = callback ? offer.partner.getSteamID64() : offer.partner();
    const time = new Date().getTime();
    request({
        url: 'https://api.tf2automatic.com/v1/users/alt',
        method: 'GET',
        qs: {
            steamid: steamid
        }
    }, function (err, response, body) {
        log.debug('Got alt-check response in ' + (new Date().getTime() - time) + ' ms');
        if (err) {
            log.warn('An error occurred while doing alt check, trying again in 10 seconds...');
            setTimeout(function () {
                altcheckOffer(offer, callback);
            }, 10000);
            return;
        }

        const isAlt = body.result.is_alt;
        const reviewed = body.result.reviewed;

        if (!isAlt) {
            finalizeOffer(offer, callback);
        } else {
            if (callback) {
                if (reviewed) {
                    callback(null, 'Your account is suspicious and has therefore been marked.');
                } else {
                    callback(null, 'Your account is suspicious. Please wait while your account is reviewed and try again later - this is to prevent trading with obvious scammer alts.');
                }
            } else {
                ERRORS.suspicious(offer, reviewed);
            }
        }
    });
}

function acceptOffer(offer) {
    offer.log('trade', 'by ' + offer.partner() + ' is offering enough, accepting. Summary:\n' + offer.summary());

    offer.accept(function (err, status) {
        if (err) {
            offer.log('warn', `could not be accepted: ${err.message}`);
            log.debug(err.stack);
        } else {
            offer.log('trade', 'successfully accepted' + (status == 'pending' ? '; confirmation required' : ''));
        }
    });
}

function offeringEnough(our, their) {
    const keyValue = utils.refinedToScrap(Prices.key());

    const ourValue = our.metal + our.keys * keyValue;
    const theirValue = their.metal + their.keys * keyValue;

    return {
        our: ourValue,
        their: theirValue
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

    log.debug('Checking escrow for offer');
    return determineEscrowDays(offer).then(function (escrowDays) {
        return escrowDays != 0;
    });
}

function getOffer(id, callback) {
    manager.getOffer(id, function (err, offer) {
        if (err) {
            callback(err);
            return;
        }

        offer = new Offer(offer);
        callback(null, offer);
    });
}

function receivedOfferChanged(offer, oldState) {
    if (!READY) {
        RECEIVED_OFFER_CHANGED.push({ offer: offer, oldState: oldState });
        return;
    } else if (Automatic.running != true) {
        return;
    }

    log.verbose('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        removeItemsInTrade(offer.itemsToGive);
        Screenshot.receivedOfferChanged(offer.id, function (err, id) {
            if (err) {
                Automatic.alert('trade', 'Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() + '.');
                let embed = new Discord.RichEmbed()
                    .setTitle("New trade!")
                    .setDescription("I received a trade.")
                    .addField('Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase())
                discordbot.channels.get(discordbotconfig.channelid).send(embed);
                log.warn('Error when capturing and sending screenshot: ' + err.message);
                log.debug(err.stack);
                return;
            }

            log.debug('Image uploaded, returned id: ' + id);
            Automatic.alert('trade', 'Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() + ', view it here https://tf2automatic.com/trades?id=' + id);
            let embed = new Discord.RichEmbed()
                .setTitle("New trade!")
                .setDescription("I recieved a trade.")
                .addField('Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase())
                .setImage('https://tf2automatic.com/trades?id=' + id)
            discordbot.channels.get(discordbotconfig.channelid).send(embed);
        });
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        Automatic.message(offer.partner, 'Success! Your offer went through successfully.');
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        Automatic.message(offer.partner, 'Ohh nooooes! Your offer is no longer available. Reason: Items not available (traded away in a different trade).');
    }
}

function sentOfferChanged(offer, oldState) {
    if (!READY) {
        SENT_OFFER_CHANGED.push({ offer: offer, oldState: oldState });
        return;
    } else if (Automatic.running != true) {
        return;
    }

    log.verbose('Offer #' + offer.id + ' state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);
    if (offer.state != TradeOfferManager.ETradeOfferState.Active) {
        Queue.removeID(offer.id);

        removeItemsInTrade(offer.itemsToGive);
        Screenshot.sentOfferChanged(offer.id, function (err, id) {
            if (err) {
                Automatic.alert('trade', 'Sent offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() + '.');
                let embed = new Discord.RichEmbed()
                    .setTitle("New trade!")
                    .setDescription("I recieved a trade.")
                    .addField('Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase())
                log.warn('Error when capturing and sending screenshot: ' + err.message);
                log.debug(err.stack);
                return;
            }

            log.debug('Image uploaded, returned id: ' + id);
            Automatic.alert('trade', 'Sent offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() + ', view it here https://tf2automatic.com/trades?id=' + id);
            let embed = new Discord.RichEmbed()
                .setTitle("New trade!")
                .setDescription("I sent a trade offer.")
                .addField('Received offer #' + offer.id + ' (' + offer.partner.getSteamID64() + ') is now marked as ' + TradeOfferManager.ETradeOfferState[offer.state].toLowerCase())
                .setImage('https://tf2automatic.com/trades?id=' + id)
            discordbot.channels.get(discordbotconfig.channelid).send(embed);
        });
    }

    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        Automatic.message(offer.partner, 'Success! The offer went through successfully.');
        const items = offer.data('items');
        if (!items || items.length == 0) {
            log.trade('Offer #' + offer.id + ' User accepted the offer');
        } else {
            const price = Prices.valueToCurrencies(items[0].value * items[0].ids.length, items[0].name != 'Mann Co. Supply Crate Key');
            const item = items[0].name + (items[0].ids.length > 1 ? ' x' + items[0].ids.length : '');
            log.trade('Offer #' + offer.id + ' User (' + offer.partner.getSteamID64() + ') accepted an offer sent by me.\n' + (items[0].intent == 0 ? 'Bought' : 'Sold') + ' ' + item + ' worth ' + utils.currencyAsText(price));
        }
        offerAccepted(offer);
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Active) {
        Automatic.message(offer.partner, 'Your offer is now active! You can accept it by clicking on either "View trade offer", or https://steamcommunity.com/tradeoffer/' + offer.id + '/');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Declined) {
        Automatic.message(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: The offer has been declined.');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.InvalidItems) {
        Automatic.message(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: Items not available (traded away in a different trade).');
    } else if (offer.state == TradeOfferManager.ETradeOfferState.Canceled) {
        if (oldState == TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
            Automatic.message(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: Failed to accept mobile confirmation.');
        } else {
            Automatic.message(offer.partner, 'Ohh nooooes! The offer is no longer available. Reason: The offer has been active for a while.');
        }
    }
}

function offerAccepted(offer) {
    Friends.sendGroupInvites(offer.partner);
    Inventory.getInventory(Automatic.getOwnSteamID(), function () {
        const doneSomething = smeltCraftMetal();
        if (!doneSomething) {
            log.debug('Sorting inventory');
            tf2.sortBackpack(3);
        }
        handleAcceptedOffer(offer);
    });
}

function handleAcceptedOffer(offer) {
    offer.getReceivedItems(true, function (err, receivedItems) {
        if (err) {
            log.warn('Failed to get received items from offer, retrying in 30 seconds.');
            log.debug(err.stack);
            if (err.message == 'Not Logged In' || err.message == 'ESOCKETTIMEDOUT') {
                Automatic.refreshSession();
            }
            setTimeout(function () {
                handleAcceptedOffer(offer);
            }, 30 * 1000);
            return;
        }

        offer.itemsToGive.forEach(function (item) {
            Backpack.updateOrders(item, false);
        });

        receivedItems.forEach(function (item) {
            Backpack.updateOrders(item, true);
        });

        const received = Items.createDictionary(receivedItems);

        const items = offer.data('items') || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].intent != 0) {
                continue;
            }

            for (const name in received) {
                if (name == items[i].name) {
                    items[i].ids = received[name];
                    break;
                }
            }
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            for (let j = 0; j < item.ids.length; j++) {
                const id = item.ids[j];
                Statistics.addItem(item.name, id, item.value, item.intent);
            }
        }
    });
}

function smeltCraftMetal() {
    if (tf2.haveGCSession) {
        const dict = Inventory.dictionary();
        const inv = filterItems(dict);

        const scrap = inv['Scrap Metal'] || [];
        let scrapSum = scrap.length;
        const reclaimed = inv['Reclaimed Metal'] || [];
        let reclaimedSum = reclaimed.length;
        const refined = inv['Refined Metal'] || [];

        let doneSomething = false;

        const combineScrap = Math.floor((scrapSum - 9) / 3);
        if (combineScrap > 0) {
            for (let i = 0; i < combineScrap; i++) {
                const ids = utils.paginateArray(scrap, 3, i);
                if (ids.length != 3) {
                    break;
                }

                tf2.craft(ids);
                scrapSum -= 3;
                reclaimedSum += 1;

                doneSomething = true;
            }
        }

        const combineReclaimed = Math.floor((reclaimedSum - 12) / 3);
        if (combineReclaimed > 0) {
            for (let i = 0; i < combineReclaimed; i++) {
                const ids = utils.paginateArray(reclaimed, 3, i);
                if (ids.length != 3) {
                    break;
                }

                tf2.craft(ids);
                reclaimedSum -= 3;

                doneSomething = true;
            }
        }

        const smeltRefined = Math.abs(Math.floor((reclaimedSum - 12) / 3));
        if (smeltRefined > 0) {
            for (let i = 0; i < smeltRefined; i++) {
                const id = refined[i];
                if (!id) {
                    break;
                }

                tf2.craft([id]);
                reclaimedSum += 3;

                doneSomething = true;
            }
        }

        const smeltReclaimed = Math.abs(Math.floor((scrapSum - 9) / 3));
        if (smeltReclaimed > 0) {
            for (let i = 0; i < smeltReclaimed; i++) {
                const id = reclaimed[i];
                if (!id) {
                    break;
                }

                tf2.craft([id]);
                scrapSum += 3;
                reclaimedSum -= 1;

                doneSomething = true;
            }
        }

        if (doneSomething) {
            log.debug('Done crafting');
            log.debug('Sorting inventory');
            tf2.sortBackpack(3);
            client.gamesPlayed([440]);
            Inventory.getInventory(Automatic.getOwnSteamID(), function () {
                client.gamesPlayed([require('../package.json').name, 440]);
            });
        }

        return doneSomething;
    }
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

        const received = body.response.pending_received_count;
        const sent = body.response.pending_sent_count;
        const escrowReceived = body.response.escrow_received_count;
        const escrowSent = body.response.escrow_sent_count;

        log.verbose(`${received} incoming ${utils.plural('offer', received)} (${escrowReceived} on hold), ${sent} sent ${utils.plural('offer', sent)} (${escrowSent} on hold)`);
    });
}

function savePollData(pollData) {
    pollData = removeOldOffers(pollData);
    manager.pollData = pollData;

    fs.writeFile(POLLDATA_FILENAME, JSON.stringify(pollData, null, '\t'), function (err) {
        if (err) {
            log.warn('Error writing poll data: ' + err);
        }
    });
}

function removeOldOffers(pollData) {
    const current = utils.seconds();
    const max = 3600; // 1 hour

    if (!pollData.hasOwnProperty('offerData')) pollData.offerData = {};

    for (const id in pollData.timestamps) {
        if (!pollData.timestamps.hasOwnProperty(id)) {
            continue;
        }

        const time = pollData.timestamps[id];
        let state;
        if (pollData.sent[id]) state = pollData.sent[id];
        else if (pollData.received[id]) state = pollData.received[id];

        /* eslint-disable-next-line max-len */
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

const ERRORS = {
    invalid_items: function (offer) {
        offer.log('info', 'contains an item that is not in the pricelist, declining. Summary:\n' + offer.summary());
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are taking / offering an item that is not in my pricelist' });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    only_metal: function (offer) {
        offer.log('info', 'we are both offering only metal, declining. Summary:\n' + offer.summary());
        Automatic.alert('trade', 'We are both only offering metal, declining.');

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    overstocked: function (offer) {
        offer.log('info', 'contains overstocked items, declining. Summary:\n' + offer.summary());
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are offering overstocked / too many items' });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    invalid_value: function (offer) {
        offer.log('info', 'is not offering enough, declining. Summary:\n' + offer.summary());
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are not offering enough' });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    bptf_banned: function (offer) {
        offer.log('info', 'is all-features banned on www.backpack.tf, declining. Summary:\n' + offer.summary());
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are all-features banned on www.backpack.tf' });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    sr_marked: function (offer) {
        offer.log('info', 'user is marked on www.steamrep.com, declining. Summary:\n' + offer.summary());
        Friends.alert(offer.partner(), { type: 'trade', status: 'declined', reason: 'You are marked on www.steamrep.com as a scammer' });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    },
    suspicious: function (offer, reviewed) {
        let msg;
        if (reviewed) {
            offer.log('info', 'user is marked as an obvious scammer alt, declining. Summary:\n' + offer.summary());
            msg = 'Your account is suspicious and has therefore been marked.';
        } else {
            offer.log('info', 'user is suspicious (detected by the alt checker), declining. Summary:\n' + offer.summary());
            msg = 'Your account is suspicious. Please wait while your account is reviewed and try again later - this is to prevent trading with obvious scammer alts.';
        }

        Friends.alert(offer.partner(), {
            type: 'trade',
            status: 'declined',
            reason: msg
        });

        offer.decline(function () {
            offer.log('debug', 'declined');
        });
    }
};

discordbot.login(discordbotconfig.tokenForBot);