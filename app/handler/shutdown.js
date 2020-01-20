// @ts-check

const log = require('../../lib/logger');

module.exports = function (err, done) {
    require('./listings').removeAll(function (err) {
        if (err) {
            log.warn('Failed to remove all listings: ', err);
        }

        done();
    });
};
