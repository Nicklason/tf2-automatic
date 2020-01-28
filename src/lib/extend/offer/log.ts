import { TradeOffer } from 'steam-tradeoffer-manager';

import log from '../../logger';

export = function (level: string, message: string) {
    // @ts-ignore
    const self = <TradeOffer>this;

    log[level]('Offer' + (self.id ? ' #' + self.id : '') + (self.isOurOffer ? ' with ' : ' from ') + self.partner.getSteamID64() + ' ' + message);
};
