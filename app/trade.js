const TradeOfferManager = require('steam-tradeoffer-manager');

const log = require('lib/logger');
const community = require('lib/community');

const handlerManager = require('app/handler-manager');

const communityLoginCallback = require('utils/communityLoginCallback');
const backoff = require('utils/exponentialBackoff');

const receivedOffers = [];
const itemsInTrade = [];

let processingOffer = false;

/**
 * This function is called when polldata is emitted by the manager
 * @param {Object} pollData
 */
exports.onPollData = function (pollData) {
    // Remove data from old offers

    const current = Math.round(new Date().getTime() / 1000);
    const max = 3600;

    for (const id in pollData.timestamps) {
        if (!Object.prototype.hasOwnProperty.call(pollData.timestamps, id)) {
            continue;
        }

        const time = pollData.timestamps[id];
        let state;

        if (pollData.sent[id] !== undefined) {
            state = pollData.sent[id];
        } else if (pollData.received[id] !== undefined) {
            state = pollData.received[id];
        }

        const isActive = state === TradeOfferManager.ETradeOfferState.Accepted || state === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation || state === TradeOfferManager.ETradeOfferState.InEscrow;

        if (!isActive && current - time > max) {
            // FIXME: All these checks are not really nessesary
            if (pollData.offerData !== undefined && pollData.offerData[id]) {
                delete pollData.offerData[id];
            }
            if (pollData.timestamps[id]) {
                delete pollData.timestamps[id];
            }
        }
    }

    handlerManager.getHandler().onPollData(pollData);
};

exports.setPollData = function (pollData) {
    // Go through sent and received offers

    const activeOrCreatedNeedsConfirmation = [];

    for (const id in pollData.sent) {
        if (!Object.prototype.hasOwnProperty.call(pollData.sent, id)) {
            continue;
        }

        const state = pollData.sent[id];

        if (state === TradeOfferManager.ETradeOfferState.Active || state === TradeOfferManager.EConfirmationMethod.CreatedNeedsConfirmation) {
            activeOrCreatedNeedsConfirmation.push(id);
        }
    }

    for (const id in pollData.received) {
        if (!Object.prototype.hasOwnProperty.call(pollData.received, id)) {
            continue;
        }

        const state = pollData.received[id];

        if (state === TradeOfferManager.ETradeOfferState.Active) {
            activeOrCreatedNeedsConfirmation.push(id);
        }
    }

    // Go through all sent / received offers and mark the items as in trade
    for (let i = 0; i < activeOrCreatedNeedsConfirmation.length; i++) {
        const id = activeOrCreatedNeedsConfirmation[i];

        const offerData = pollData.offerData === undefined ? {} : (pollData.offerData[id] || {});
        const items = offerData.items || [];

        for (let i = 0; i < items.length; i++) {
            exports.setItemInTrade(items[i].assetid);
        }
    }

    require('lib/manager').pollData = pollData;
};

/**
 * Called when the state of an offer changes
 * @param {Object} offer
 * @param {Number} oldState
 */
exports.offerChanged = function (offer, oldState) {
    const inventoryManager = require('app/inventory');

    offer.log('verbose', 'state changed: ' + TradeOfferManager.ETradeOfferState[oldState] + ' -> ' + TradeOfferManager.ETradeOfferState[offer.state]);

    if (offer.state === TradeOfferManager.ETradeOfferState.Active || offer.state === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
        // Offer is active

        // Mark items as in trade
        offer.itemsToGive.forEach(function (item) {
            exports.setItemInTrade(item.id);
        });

        // No items saved for sent offer, save them
        if (offer.isOurOffer && offer.data('_ourItems') === null) {
            offer.data('_ourItems', offer.itemsToGive.map((item) => mapItem(item)));
        }
    } else {
        // Offer is not active and items are not in trade
        offer.itemsToGive.forEach(function (item) {
            exports.unsetItemInTrade(item.id);
        });

        // Unset items
        offer.data('_ourItems', undefined);

        const finishTimestamp = new Date().getTime();

        // Time when the offer was not active anymore
        offer.data('finishTimestamp', finishTimestamp);

        const processTime = finishTimestamp - offer.data('handleTimestamp');

        log.debug('Took ' + (isNaN(processTime) ? 'unknown' : processTime) + ' ms to process offer', { offer_id: offer.id, state: offer.state, finish_time: processTime });
    }

    if (offer.state !== TradeOfferManager.ETradeOfferState.Accepted) {
        handlerManager.getHandler().onTradeOfferChanged(offer, oldState);
        return;
    }

    // Offer is accepted, update inventory
    if (offer.itemsToGive.length !== 0) {
        // Remove lost items from inventory
        offer.itemsToGive.forEach(function (item) {
            inventoryManager.removeItem(item.assetid);
        });
    }

    // Fetch inventory to get received items
    inventoryManager.getInventory(community.steamID, function () {
        handlerManager.getHandler().onTradeOfferChanged(offer, oldState);
    });
};

/**
 * Called when a new offer is received
 * @param {Object} offer
 */
exports.newOffer = function (offer) {
    if (offer.isGlitched()) {
        // The offer is glitched, skip it
        log.debug('Offer is glitched', { offer_id: offer.id });
        return;
    }

    offer.log('info', 'received offer');

    // Offer is active, items are in trade
    offer.itemsToGive.forEach(function (item) {
        exports.setItemInTrade(item.id);
    });

    offer.data('partner', offer.partner.getSteamID64());

    // Enqueue the offer
    enqueueOffer(offer);
};

/**
 * Get items that are being traded
 * @return {Array<String>}
 */
exports.inTrade = function () {
    return itemsInTrade;
};

/**
 * Removes an item from the items in trade list
 * @param {String} assetid
 */
exports.unsetItemInTrade = function (assetid) {
    const index = itemsInTrade.indexOf(assetid);

    if (index !== -1) {
        itemsInTrade.splice(index, 1);
    }
};

/**
 * Adds an item to the items in trade list
 * @param {String} assetid
 */
exports.setItemInTrade = function (assetid) {
    const index = itemsInTrade.indexOf(assetid);

    if (index === -1) {
        itemsInTrade.push(assetid);
    }
};

/**
 * Enqueues a new offer
 * @param {Object} offer
 */
function enqueueOffer (offer) {
    if (receivedOffers.indexOf(offer.id) === -1) {
        receivedOffers.push(offer.id);

        if (receivedOffers.length === 1) {
            // Queue is empty, check the offer right away
            processingOffer = true;
            handlerProcessOffer(offer);
        } else {
            processNextOffer();
        }
    }
}

/**
 * Sends an offer and handles errors
 * @param {Object} offer
 * @param {Function} callback
 */
exports.sendOffer = function (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    const ourItems = [];

    offer.itemsToGive.forEach(function (item) {
        exports.setItemInTrade(item.assetid);
        ourItems.push(mapItem(item));
    });

    offer.data('_ourItems', ourItems);

    offer.data('handledByUs', true);

    const sendTime = new Date().getTime();
    offer.data('actionTimestamp', sendTime);

    log.debug('Sending offer...', { partner: offer.partner.getSteamID64(), ourItems: offer.itemsToGive.length, theirItems: offer.itemsToReceive.length });

    sendOfferRetry(offer, function (err, status) {
        const actionTime = new Date().getTime() - sendTime;
        offer.data('actionTime', actionTime);

        if (err) {
            log.warn('Failed to send offer: ', err);

            // Failed to send the offer, the items are no longer in trade
            offer.itemsToGive.forEach(function (item) {
                exports.unsetItemInTrade(item.id);
            });
            return callback(err);
        }

        offer.log('trade', 'successfully created' + (status === 'pending' ? '; confirmation required' : ''));

        if (status === 'pending') {
            acceptConfirmation(offer);
        }

        callback(null, status);
    });
};

function sendOfferRetry (offer, callback, tries = 0) {
    offer.send(function (err, status) {
        tries++;
        if (err) {
            if (tries >= 5) {
                return callback(err);
            }

            if (err.message.indexOf('can only be sent to friends') !== -1) {
                return callback(err);
            } else if (err.message.indexOf('is not available to trade') !== -1) {
                return callback(err);
            } else if (err.message.indexOf('maximum number of items allowed in your Team Fortress 2 inventory') !== -1) {
                return callback(err);
            } else if (err.eresult !== undefined) {
                if (err.eresult === TradeOfferManager.EResult.Revoked) {
                    // One or more of the items does not exist in the inventories, refresh our inventory and return the error
                    return require('app/inventory').getInventory(community.steamID, function () {
                        callback(err);
                    });
                } else if (err.eresult === TradeOfferManager.EResult.Timeout) {
                    // Failed to send offer, but there is a chance that it has been made anyway

                    // I am actually not sure if this works, but I don't see why it wouldn't ¯\_(ツ)_/¯

                    return setTimeout(function () {
                        // Check if the offer was made
                        findMatchingOffer(offer, true, function (err2, match) {
                            if (err2) {
                                return callback(err2);
                            }

                            if (match === null) {
                                // No match, retry sending the offer
                                return sendOfferRetry(offer, callback, tries);
                            }

                            // Update the offer we attempted to send with the properties from the matching offer
                            offer.id = match.id;
                            offer.state = match.state;
                            offer.created = match.created;
                            offer.updated = match.updated;
                            offer.expires = match.expires;
                            offer.confirmationMethod = match.confirmationMethod;

                            // Move data set on the offer to polldata (https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/lib/classes/TradeOffer.js#L370)
                            for (const property in offer._tempData) {
                                if (Object.prototype.hasOwnProperty.call(offer._tempData, property)) {
                                    offer.manager.pollData.offerData = offer.manager.pollData.offerData || {};
                                    offer.manager.pollData.offerData[offer.id] = offer.manager.pollData.offerData[offer.id] || {};
                                    offer.manager.pollData.offerData[offer.id][property] = offer._tempData[property];
                                }
                            }

                            delete offer._tempData;

                            // Emit polldata
                            offer.manager.emit('pollData', offer.manager.pollData);

                            callback(null, offer.state === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation ? 'pending' : 'sent');
                        });
                    }, backoff(tries - 1));
                } else {
                    return callback(err);
                }
            }

            if (err.message !== 'Not Logged In') {
                setTimeout(function () {
                    sendOfferRetry(offer, callback, tries);
                }, backoff(tries - 1));
                return;
            }

            communityLoginCallback(true, function (err) {
                setTimeout(function () {
                    sendOfferRetry(offer, callback, tries);
                }, err !== null ? backoff(tries - 1) : 0);
            });
            return;
        }

        callback(null, status);
    });
}

function getOffers (includeInactive, callback) {
    if (typeof includeInactive === 'function') {
        callback = includeInactive;
        includeInactive = false;
    }

    require('lib/manager').getOffers(includeInactive ? TradeOfferManager.EOfferFilter.All : TradeOfferManager.EOfferFilter.ActiveOnly, callback);
}

/**
 * Finds matching offer
 * @param {Object} offer
 * @param {Boolean} isSent Search for sent or received offers
 * @param {Functions} callback
 */
function findMatchingOffer (offer, isSent, callback) {
    // Get current offers
    getOffers(function (err, sent, received) {
        if (err) {
            return callback(err);
        }

        // Find matching offer
        const match = (isSent ? sent : received).find((v) => offerEquals(offer, v));

        // Return match
        return callback(null, match === undefined ? null : match);
    });
}

/**
 * Checks if two offers are identical - if they are to / from same account and contains same items
 * @param {Object} a
 * @param {Object} b
 * @return {Boolean}
 */
function offerEquals (a, b) {
    return a.isOurOffer === b.isOurOffer && a.partner.getSteamID64() === b.partner.getSteamID64() && itemsEquals(a.itemsToGive, b.itemsToGive) && itemsEquals(a.itemsToReceive, b.itemsToReceive);
}

/**
 * Checks if two lists contains the same items
 * @param {Array<Object>} a
 * @param {Array<Object>} b
 * @return {Boolean}
 */
function itemsEquals (a, b) {
    if (a.length !== b.length) {
        return false;
    }

    const copy = b.concat();

    for (let i = 0; i < a.length; i++) {
        // Find index of matching item
        const index = copy.findIndex((item) => itemEquals(item, a[i]));

        if (index === -1) {
            // Item was not found, offers don't match
            return false;
        }

        // Remove match from list
        copy.splice(index, 1);
    }

    return copy.length === 0;
}

function itemEquals (a, b) {
    return a.appid == b.appid && a.contextid == b.contextid && (a.assetid || a.id) == (b.assetid || b.id);
}

function mapItem (item) {
    return {
        appid: item.appid,
        contextid: item.contextid,
        assetid: item.assetid,
        amount: item.amount
    };
}

exports.acceptOffer = function (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    offer.data('handledByUs', true);

    const acceptTime = new Date().getTime();
    offer.data('actionTimestamp', acceptTime);

    log.debug('Accepting offer...', { offer_id: offer.id });

    acceptOfferRetry(offer, function (err, status) {
        const actionTime = new Date().getTime() - acceptTime;
        offer.data('actionTime', actionTime);

        if (err) {
            log.warn('Offer #' + offer.id + ' failed to accept offer: ', err);
            return callback(err);
        }

        offer.log('trade', 'successfully accepted' + (status === 'pending' ? '; confirmation required' : ''));

        if (status === 'pending') {
            acceptConfirmation(offer);
        }

        callback(null, status);
    });
};

/**
 * Accepts a confirmation for offer
 * @param {Object} offer
 * @param {Function} callback
 */
function acceptConfirmation (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    // TODO: Add retrying / error handling

    log.debug('Accepting mobile confirmation...', { offer_id: offer.id });

    const confirmationStart = new Date().getTime();

    offer.data('actedOnConfirmation', true);
    offer.data('actedOnConfirmationTimestamp', confirmationStart);

    community.acceptConfirmationForObject(process.env.STEAM_IDENTITY_SECRET, offer.id, function (err) {
        const acceptConfirmationTimestamp = new Date().getTime();

        const confirmationTime = acceptConfirmationTimestamp - confirmationStart;
        offer.data('confirmationTime', confirmationTime);

        const handler = handlerManager.getHandler();

        if (err) {
            log.debug('Got an error while trying to accept mobile confirmation: ', err);
            handler.onConfirmationError(offer.id, err);
        } else {
            log.debug('Accepted mobile confirmation', { offer_id: offer.id, confirmation_time: confirmationTime });
            handler.onConfirmationAccepted(offer.id);
        }

        callback(err);
    });
}

function acceptOfferRetry (offer, callback, tries = 0) {
    // true - skip state update used to check if a trade is being held
    offer.accept(true, function (err, status) {
        tries++;
        if (err) {
            if (err.eresult !== undefined) {
                return callback(err);
            } else if (tries >= 5) {
                return callback(err);
            }

            if (err.message !== 'Not Logged In') {
                setTimeout(function () {
                    acceptOfferRetry(offer, callback, tries);
                }, backoff(tries - 1));
                return;
            }

            communityLoginCallback(true, function (err) {
                setTimeout(function () {
                    acceptOfferRetry(offer, callback, tries);
                }, err !== null ? backoff(tries - 1) : 0);
            });
            return;
        }

        callback(null, status);
    });
}

exports.declineOffer = function (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    offer.data('handledByUs', true);

    const acceptTime = new Date().getTime();
    offer.data('actionTimestamp', acceptTime);

    // TODO: Add error handling
    offer.decline(function (err) {
        const actionTime = new Date().getTime() - acceptTime;
        offer.data('actionTime', actionTime);

        callback(err);
    });
};

exports.cancelOffer = function (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    // TODO: Add error handling
    offer.decline(function (err) {
        callback(err);
    });
};

/**
 * Processes a new offer, can only process one at a time
 */
function processNextOffer () {
    if (processingOffer || receivedOffers.length === 0) {
        return;
    }

    processingOffer = true;

    const offerId = receivedOffers[0];

    log.verbose('Handling offer #' + offerId + '...');

    getOfferRetry(offerId, function (err, offer) {
        if (err) {
            log.warn('Failed to get offer #' + offerId + ': ', err);
            // After many retries we could not get the offer data

            if (receivedOffers.length !== 1) {
                // Remove the offer from the queue and add it to the back of the queue
                receivedOffers.push(offerId);
            }

            handlerManager.getHandler().onTradeFetchError(offerId, err);
        }

        if (!offer) {
            finishedProcessing(offerId);
        } else {
            handlerProcessOffer(offer);
        }
    });
}

function handlerProcessOffer (offer) {
    log.debug('Giving offer to handler');

    const start = new Date().getTime();

    offer.data('handleTimestamp', start);

    handlerManager.getHandler().onNewTradeOffer(offer, function (action, reason, callback) {
        if (typeof reason === 'function') {
            callback = reason;
            reason = null;
        }

        if (typeof callback !== 'function') {
            callback = noop;
        }

        offer.data('handleTime', new Date().getTime() - start);

        log.debug('Handler is done with offer', { offer_id: offer.id, action: action });

        let actionFunc;

        if (action === 'accept') {
            actionFunc = exports.acceptOffer;
        } else if (action === 'decline') {
            actionFunc = exports.declineOffer;
        }

        if (!actionFunc) {
            finishedProcessing(offer.id);
            return;
        }

        if (reason !== null) {
            offer.data('action', { type: action, reason: reason });
        }

        actionFunc(offer, function (err) {
            log.debug('Done doing action on offer', { offer_id: offer.id, action: action });

            callback(err);

            finishedProcessing(offer.id);
        });
    });
}

function finishedProcessing (offerId) {
    removeFromQueue(offerId);
    processingOffer = false;
    processNextOffer();
}

/**
 * Gets an offer
 * @param {String} offerId
 * @param {Function} callback
 * @param {Number} tries
 */
function getOfferRetry (offerId, callback, tries = 0) {
    require('lib/manager').getOffer(offerId, function (err, offer) {
        tries++;

        if (err) {
            if (err.message === 'NoMatch' || err.message === 'No matching offer found') {
                // The offer does not exist
                return callback(null, null);
            }

            if (tries >= 5) {
                // Too many retries
                return callback(err);
            }

            if (err.message !== 'Not Logged In') {
                setTimeout(function () {
                    getOfferRetry(offerId, callback, tries);
                }, backoff(tries - 1));
                return;
            }

            // Our session has expired, we will wait for it to change and then retry

            // Because we have given the manager our community instance, it will be notified and the sessionExpired event will be emitted, which will result in a new session to be made
            communityLoginCallback(true, function (err) {
                setTimeout(function () {
                    getOfferRetry(offerId, callback, tries);
                }, err !== null ? backoff(tries - 1) : 0);
            });
            return;
        }

        if (offer.state !== TradeOfferManager.ETradeOfferState.Active) {
            return callback(null, null);
        }

        callback(null, offer);
    });
}

/**
 * Removes an offer from the queue
 * @param {String} offerId
 */
function removeFromQueue (offerId) {
    const index = receivedOffers.indexOf(offerId);

    if (index !== -1) {
        receivedOffers.splice(index, 1);
    }
}

function noop () {

}
