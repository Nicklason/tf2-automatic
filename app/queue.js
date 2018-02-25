const fs = require('fs');

const utils = require('./utils.js');

let Automatic, log, config, manager, client;

const QUEUE_FILENAME = 'queue.json';

let queue = [], _wait;

exports.register = function(automatic) {
    Automatic = automatic;
    log = Automatic.log;
    config = Automatic.config;
    manager = Automatic.manager;

    if (fs.existsSync(QUEUE_FILENAME)) {
        queue = JSON.parse(fs.readFileSync(QUEUE_FILENAME));
    }
};

exports.receivedOffer = enqueueReceivedOffer;
exports.getNext = getNext;
exports.removeFirst = removeFirst;
exports.removeID = removeID;

function getNext() {
    if (queue.length == 0) {
        return null;
    }

    return queue[0];
}

function removeFirst() {
    queue.splice(0, 1);
    saveQueue();
}

// ID is the offer id.
function removeID(id) {
    for (let i = 0; i < queue.length; i++) {
        const element = queue[i];
        if (queue[i].id == id) {
            queue.splice(i, 1);
            saveQueue();
            return;
        }
    }
}

function enqueueReceivedOffer(offer) {
    log.debug('Adding offer to queue');

    if (inQueue(offer.id())) {
        log.warn("Caught an offer that was getting queued, but was already added.");
        return;
    }

    var trade = {
        partner: offer.partnerID64(),
        received: true,
        id: offer.id(),
        status: "Received",
        details: {
            // No details from received offers.
        },
        time: utils.epoch()
    };
    queue.push(trade);
    
    saveQueue();
}

function inQueue(id) {
    for (let i = 0; i < queue.length; i++) {
        const offer = queue[i];
        if (offer.id == id) {
            return true;
        }
    }

    return false;
}

function saveQueue() {
    clearTimeout(_wait);

    // We will wait one second to catch more offers, no need to save for every one.
    _wait = setTimeout(function() {
        fs.writeFile(QUEUE_FILENAME, JSON.stringify(queue, null, '\t'), function(err) {
            if (err) {
                log.warn("Error writing queue data: " + err);
                return;
            }
        });
        
    }, 1000);
}