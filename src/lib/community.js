const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');

const log = require('./logger');

const community = new SteamCommunity();

community.on('sessionExpired', sessionExpiredEvent);
community.on('confKeyNeeded', confKeyNeededEvent);

function sessionExpiredEvent () {
    log.debug('Web session has expired', { event: 'sessionExpired', from: 'steamcommunity' });

    require('./client').webLogOn();
}

function confKeyNeededEvent (tag, callback) {
    log.debug('Confirmation key is requested', { event: 'confKeyNeeded', from: 'steamcommunity', tag: tag });

    const time = SteamTotp.time();
    const confKey = SteamTotp.getConfirmationKey(process.env.STEAM_IDENTITY_SECRET, time, tag);

    callback(null, time, confKey);
}

module.exports = community;
