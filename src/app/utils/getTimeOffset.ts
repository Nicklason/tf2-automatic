import SteamTotp from 'steam-totp';

let timeOffset = null;

/**
 * Gets time offset from Steam API and saves result for future reference
 * @param callback
 */
export = function (callback: (err?: Error, timeOffset?: number) => void): void {
    if (timeOffset !== null) {
        callback(null, timeOffset);
        return;
    }

    SteamTotp.getTimeOffset(function (err, offset) {
        if (err) {
            return callback(err);
        }

        timeOffset = offset;

        callback(null, timeOffset);
    });
};
