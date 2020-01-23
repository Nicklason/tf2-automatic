import SteamTotp from 'steam-totp';

import getTimeOffset from './getTimeOffset';

/**
 * Generates Steam authentication code
 * @param {Function} callback
 */
export = function (callback) {
    getTimeOffset(function (err, offset) {
        callback(err, SteamTotp.generateAuthCode(<string>process.env.STEAM_SHARED_SECRET, offset));
    });
}
