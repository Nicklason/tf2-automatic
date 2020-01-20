import SteamTotp from 'steam-totp';

import getTimeOffset from './getTimeOffset';

/**
 * Generates Steam authentication code
 * @param {Function} callback
 */
export default function (callback) {
    getTimeOffset(function (err, offset) {
        callback(err, SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET, offset));
    });
};
