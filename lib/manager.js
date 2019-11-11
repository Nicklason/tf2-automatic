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

function pollDataEvent () {
    // Remove old offers and polldata

    const current = Math.round(new Date().getTime() / 1000);
    const max = 3600;

    for (const id in manager.pollData.timestamps) {
        if (!Object.prototype.hasOwnProperty.call(manager.pollData.timestamps, id)) {
            continue;
        }

        const time = manager.pollData.timestamps[id];
        let state;
        let isSent;

        if (manager.pollData.sent[id] !== undefined) {
            state = manager.pollData.sent[id];
            isSent = true;
        } else if (manager.pollData.received[id] !== undefined) {
            state = manager.pollData.received[id];
            isSent = false;
        }

        const isActive = state === TradeOfferManager.ETradeOfferState.Accepted || state === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation || state === TradeOfferManager.ETradeOfferState.InEscrow;

        if (!isActive && current - time > max) {
            delete manager.pollData[isSent ? 'sent' : 'received'][id];
            delete manager.pollData.offerData[id];
            delete manager.pollData.timestamps[id];
        }
    }

    handlerManager.getHandler().onPollData(manager.pollData);
}

function newOfferEvent (offer) {
    require('app/trade').newOffer(offer);
}

function offerChangedEvent (offer, oldState) {
    require('app/trade').offerChanged(offer, oldState);
}

module.exports = manager;
