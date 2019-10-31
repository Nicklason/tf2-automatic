const TradeOfferManager = require('steam-tradeoffer-manager');

const community = require('lib/community');

const handlerManager = require('app/handler-manager');

const communityLoginCallback = require('utils/communityLoginCallback');

const receivedOffers = [];

let processingOffer = false;

/**
 * Enqueues a new offer
 * @param {Object} offer
 */
exports.enqueueOffer = function (offer) {
    if (receivedOffers.indexOf(offer.id) === -1) {
        receivedOffers.push(offer.id);

        if (receivedOffers.length === 1) {
            // Queue is empty, check the offer right away
            handlerProcessOffer(offer);
        } else {
            processNextOffer();
        }
    }
};

exports.acceptOffer = function (offer, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    acceptOfferRetry(offer, function (err, status) {
        if (err) {
            return callback(err);
        }

        if (status == 'pending') {
            acceptConfirmation(offer.id);
        }

        callback(null, status);
    });
};

/**
 * Accepts a confirmation
 * @param {String} objectID
 * @param {Function} callback
 */
function acceptConfirmation (objectID, callback) {
    if (callback === undefined) {
        callback = noop;
    }

    // TODO: Add retrying / error handling

    community.acceptConfirmationForObject(process.env.STEAM_SHARED_SECRET, objectID, callback);
}

function acceptOfferRetry (offer, callback, tries = 0) {
    offer.accept(function (err, status) {
        tries++;
        if (err) {
            if (tries >= 5) {
                return callback(err);
            }

            if (err.message !== 'Not Logged In') {
                setTimeout(function () {
                    acceptOfferRetry(offer, callback, tries);
                }, 5000 * tries);
                return;
            }

            communityLoginCallback(true, function (err) {
                setTimeout(function () {
                    acceptOfferRetry(offer, callback, tries);
                }, err !== null ? 5000 * tries : 0);
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

    // TODO: Add error handling
    offer.decline(callback);
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

    getOfferRetry(offerId, function (err, offer) {
        if (offer === null || offer === undefined) {
            removeFromQueue(offerId);
        }

        if (err) {
            // After many retries we could not get the offer data

            if (receivedOffers.length !== 1) {
                // Remove the offer from the queue and add it to the back of the queue
                receivedOffers.push(offerId);
            }

            handlerManager.getHandler().onTradeFetchError(offerId, err);
            processNextOffer();
            return;
        }

        if (offer === null) {
            processingOffer = false;
            processNextOffer();
        } else {
            handlerProcessOffer(offer);
        }
    });
}

function handlerProcessOffer (offer) {
    handlerManager.getHandler().onNewTradeOffer(offer, function (action) {
        if (action === 'accept') {
            exports.acceptOffer(offer, function (err) {
                if (err) {
                    handlerManager.getHandler().onTradeAcceptError(offer.id, err);
                }

                finishedProcessing(offer);
            });
        } else if (action === 'decline') {
            exports.declineOffer(offer, function (err) {
                if (err) {
                    handlerManager.getHandler().onTradeDeclineError(offer.id, err);
                }

                finishedProcessing(offer);
            });
        } else {
            finishedProcessing(offer);
        }
    });
}

function finishedProcessing (offer) {
    removeFromQueue(offer.id);
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
                }, 5000 * tries);
                return;
            }

            // Our session has expired, we will wait for it to change and then retry

            // Because we have given the manager our community instance, it will be notified and the sessionExpired event will be emitted, which will result in a new session to be made
            communityLoginCallback(true, function (err) {
                setTimeout(function () {
                    getOfferRetry(offerId, callback, tries);
                }, err !== null ? 5000 * tries : 0);
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
