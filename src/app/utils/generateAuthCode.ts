import SteamTotp from 'steam-totp';

import getTimeOffset from './getTimeOffset';

/**
 * Generates Steam authentication code
 * @param callback
 */
export = function (callback: (err?: Error, authCode?: string) => void): void {
    getTimeOffset(function (err, offset) {
        callback(err, SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET, offset));
    });
}
