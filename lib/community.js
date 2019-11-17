const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');

const client = require('lib/client');

const community = new SteamCommunity();

community.on('sessionExpired', sessionExpiredEvent);
community.on('confKeyNeeded', confKeyNeededEvent);

function sessionExpiredEvent () {
    client.webLogon();
}

function confKeyNeededEvent (tag, callback) {
    const time = Math.floor(Date.now() / 1000);
    callback(null, time, SteamTotp.getConfirmationKey(process.env.STEAM_IDENTITY_SECRET, time, tag));
}

module.exports = community;
