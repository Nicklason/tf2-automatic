const TradeOfferManager = require('steam-tradeoffer-manager');

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
    require('app/trade').onPollData(manager.pollData);
}

function newOfferEvent (offer) {
    require('app/trade').newOffer(offer);
}

function offerChangedEvent (offer, oldState) {
    require('app/trade').offerChanged(offer, oldState);
}

module.exports = manager;
