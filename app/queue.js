const fs = require('graceful-fs');

const utils = require('./utils.js');

let log;

const FOLDER_NAME = 'temp';
const QUEUE_FILENAME = FOLDER_NAME + '/queue.json';

let queue = [], _wait;

exports.register = function(automatic) {
    log = automatic.log;

    if (fs.existsSync(QUEUE_FILENAME)) {
        queue = JSON.parse(fs.readFileSync(QUEUE_FILENAME));
    }
};

exports.requestedOffer = enqueueRequestedOffer;
exports.receivedOffer = enqueueReceivedOffer;
exports.getNext = getNext;
exports.removeFirst = removeFirst;
exports.removeID = removeID;
exports.inQueue = isInQueue;

exports.getLength = function() {
    return queue.length;
};

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
    let changed = false;
    for (var i = queue.length; i--;) {
        if (queue[i].id == id) {
            queue.splice(i, 1);
            changed = true;
        }
    }

    if (changed) {
        saveQueue();
    }
}

function enqueueReceivedOffer(offer) {
    log.debug('Adding offer to queue');

    if (offerInQueue(offer.id)) {
        log.warn('Caught an offer that was getting queued, but was already added.');
        return;
    }

    const trade = {
        partner: offer.partner(),
        id: offer.id(),
        status: 'Received',
        details: {},
        time: utils.epoch()
    };
    
    queue.push(trade);
    saveQueue();
}

function enqueueRequestedOffer(steamID64, details) {
    log.debug('Adding requested offer to queue');

    const trade = {
        partner: steamID64,
        status: 'Queued',
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

function isInQueue(steamID64) {
    for (let i = 0; i < queue.length; i++) {
        const offer = queue[i];
        if (offer.status == 'Queued' && offer.partner == steamID64) {
            return i + 1;
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
                log.warn('Error writing queue data: ' + err);
                return;
            }
        });
        
    }, 1000);
}