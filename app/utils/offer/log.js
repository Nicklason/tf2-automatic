const log = require('lib/logger');

module.exports = function (level, message) {
    log[level]('Offer #' + this.id + ' ' + message);
};
