const log = require('lib/logger');
const files = require('utils/files');

const paths = require('resources/paths');

/**
 * Saves data from events
 * @param {Object} opts
 * @param {String} opts.event Name of the event
 * @param {Boolean} opts.json If the data should be stringified
 * @param {*} data
 */
module.exports = function (opts, data) {
    // onLoginKey -> loginKey
    const pathKey = opts.event.charAt(2).toLowerCase() + opts.event.substring(3);

    if (!Object.prototype.hasOwnProperty.call(paths, pathKey)) {
        throw new Error('Unknown path `' + pathKey + '`');
    }

    files.writeFile(paths[pathKey], data, opts.json, function (err) {
        if (err) {
            log.warn('Error saving ' + pathKey, { error: err });
        }
    });
};
