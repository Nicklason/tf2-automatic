const TradeOfferManager = require('steam-tradeoffer-manager');

const handlerManager = require('app/handler-manager');

const client = require('lib/client');
const community = require('lib/community');

const manager = new TradeOfferManager({
    steam: client,
    community: community,
    language: 'en',
    pollInterval: 1000
});

manager.on('newOffer', newOfferEvent);
manager.on('receivedOfferChanged', offerChangedEvent);
manager.on('sentOfferChanged', offerChangedEvent);
manager.on('pollData', pollDataEvent);

function pollDataEvent (pollData) {
    handlerManager.getHandler().onPollData(pollData);
}

function newOfferEvent (offer) {
    require('app/trade').enqueueOffer(offer);
}

function offerChangedEvent (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted || offer.state === TradeOfferManager.ETradeOfferState.InEscrow) {
        // Remove lost items from inventory
        const inventoryManager = require('app/inventory');

        offer.itemsToGive.forEach(function (item) {
            inventoryManager.removeItem(item.assetid);
        });
    }

    handlerManager.getHandler().onTradeOfferUpdated(offer, oldState);
}

module.exports = manager;
