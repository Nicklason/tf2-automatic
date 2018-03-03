const fs = require('graceful-fs');

const utils = require('./utils.js');

let Automatic, log, config, manager, client;

const FOLDER_NAME = 'temp';
const QUEUE_FILENAME = FOLDER_NAME + '/queue.json';

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

    if (offerInQueue(offer.id())) {
        log.warn("Caught an offer that was getting queued, but was already added.");
        return;
    }

    const trade = {
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

function enqueueRequestedOffer(steamID64, details, callback) {
    log.debug("Adding requested offer to queue");

    if (steamIDInQueue(steamID64)) {
        log.warn("User is already in the queue");
        callback(false);
        return;
    }

    const trade = {
        partner: steamID64,
        received: false,
        status: "Queued",
        details: {
            name: details.name,
            amount: details.amount,
            intent: details.intent
        },
        time: utils.epoch()
    };

    queue.push(trade);
    saveQueue();
}

function steamIDInQueue(steamID64) {
    for (let i = 0; i < queue.length; i++) {
        const offer = queue[i];
        if (offer.partnerID64 == steamID64) {
            return true;
        }
    }

    return false;
}

function offerInQueue(id) {
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