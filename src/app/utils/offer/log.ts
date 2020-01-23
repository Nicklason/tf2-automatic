import log from '../../../lib/logger';

export = function (level: string, message: string) {
    // @ts-ignore
    log[level]('Offer' + (this.id ? ' #' + this.id : '') + ' with ' + this.partner.getSteamID64() + ' ' + message);
};
