import log from '../../../lib/logger';

export default function (level, message) {
    // @ts-ignore
    log[level]('Offer' + (this.id ? ' #' + this.id : '') + ' with ' + this.partner.getSteamID64() + ' ' + message);
};
