const SteamTotp = require('steam-totp');

const getTimeOffset = require('./getTimeOffset');

/**
 * Generates Steam authentication code
 * @param {Function} callback
 */
export default function (callback) {
    getTimeOffset(function (err, offset) {
        callback(err, SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET, offset));
    });
};
