const TradeOfferManager = require('steam-tradeoffer-manager');

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
            handlerManager.getHandler().onNewTradeOffer(offer, function () {
                removeFromQueue(offer.id);
                processingOffer = false;
                processNextOffer();
            });
        } else {
            processNextOffer();
        }
    }
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
        if (err) {
            // After many retries we could not get the offer data

            if (receivedOffers.length !== 1) {
                // Remove the offer from the queue and add it to the back of the queue
                removeFromQueue(offerId);
                receivedOffers.push(offerId);
            }

            handlerManager.getHandler().onTradeFetchError(offerId, err);
            processNextOffer();
            return;
        }

        handlerManager.getHandler().onNewTradeOffer(offer, function () {
            removeFromQueue(offerId);
            processingOffer = false;
            processNextOffer();
        });
    });
}

/**
 * Gets an offer
 * @param {String} offerId
 * @param {Function} callback
 * @param {Number} tries
 */
function getOfferRetry (offerId, callback, tries) {
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
