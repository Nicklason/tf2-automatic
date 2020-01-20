const SteamTotp = require('steam-totp');

let timeOffset = null;

/**
 * Gets time offset from Steam API and saves result for future reference
 * @param {Function} callback
 */
export default function (callback) {
    if (timeOffset !== null) {
        callback(null, timeOffset);
        return;
    }

    SteamTotp.getTimeOffset(function (err, offset, elapsedTime) {
        if (err) {
            return callback(err);
        }

        timeOffset = offset;

        callback(null, timeOffset);
    });
};
