//@ts-check

const log = require('../../../lib/logger');

module.exports = function (level, message) {
    log[level]('Offer' + (this.id ? ' #' + this.id : '') + ' with ' + this.partner.getSteamID64() + ' ' + message);
};
