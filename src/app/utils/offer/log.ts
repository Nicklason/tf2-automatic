import { TradeOffer } from 'steam-tradeoffer-manager';

import log from '../../../lib/logger';

export = function (level: string, message: string) {
    // @ts-ignore
    const self = <TradeOffer>this;

    log[level]('Offer' + (self.id ? ' #' + self.id : '') + ' with ' + self.partner.getSteamID64() + ' ' + message);
};
