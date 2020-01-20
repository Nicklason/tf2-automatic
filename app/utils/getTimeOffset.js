const SteamTotp = require('steam-totp');

let timeOffset = null;

/**
 * Gets time offset from Steam API and saves result for future reference
 * @param {Function} [callback]
 * @return {Number|undefined}
 */
module.exports = function (callback) {
    if (timeOffset !== null) {
        if (callback === undefined) {
            return timeOffset;
        }

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
