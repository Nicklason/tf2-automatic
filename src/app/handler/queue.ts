import moment from 'moment';

import log from '../../lib/logger';
import * as handlerManager from '../handler-manager';
import client from '../../lib/client';

const queue = [];
let processingQueue = false;

exports.getQueue = function () {
    return queue;
};

exports.getPosition = function (steamID) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    return queue.findIndex((v) => v.steamid === steamID64);
};

exports.addRequestedTrade = function (steamID, sku, amount, buying) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    const entry = {
        steamid: steamID64,
        sku: sku,
        amount: amount,
        buying: buying,
        time: moment().unix()
    };

    log.debug('Adding requested offer to the queue', entry);

    queue.push(entry);

    queueChanged();

    return queue.length - 1;
};

exports.handleQueue = function () {
    if (processingQueue || queue.length === 0) {
        return;
    }

    processingQueue = true;

    const entry = queue[0];

    require('./trades').createOffer(entry, function (err, failedMessage) {
        queue.splice(0, 1);
        if (err) {
            log.debug('Failed to create offer: ', err);
            client.chatMessage(entry.steamid, 'Something went wrong while trying to make the offer, try again later!');
        } else if (failedMessage) {
            client.chatMessage(entry.steamid, 'I failed to make the offer. Reason: ' + failedMessage + '.');
        } else {
            client.chatMessage(entry.steamid, 'Your offer has been made, please wait while I accept the mobile confirmation.');
        }

        processingQueue = false;
        exports.handleQueue();
    });
};

function queueChanged () {
    handlerManager.getHandler().onQueue(queue);
}
