const SteamID = require('steamid');

const client = require('lib/client');

const admins = process.env.ADMINS === undefined ? [] : JSON.parse(process.env.ADMINS);

admins.forEach(function (steamid64) {
    if (!new SteamID(steamid64).isValid()) {
        throw new Error('Invalid admin SteamID64 "' + steamid64 + '"');
    }
});

exports.message = function (message) {
    admins.forEach(function (steamID) {
        client.chatMessage(steamID, message);
    });
};

exports.isAdmin = function (steamID) {
    const steamid64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();
    return admins.indexOf(steamid64) !== -1;
};
