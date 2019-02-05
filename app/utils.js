const request = require('request');
const moment = require('moment');

exports.fatal = function (log, msg) {
    log.error(msg);
    process.exit(1);
};

exports.void = function () {

};

exports.paginateArray = function (array, size, page) {
    return array.slice(page * size, (page + 1) * size);
};

exports.seconds = function () {
    const seconds = Math.round(new Date().getTime() / 1000);
    return seconds;
};

exports.secondsToday = function () {
    const today = new Date();
    today.setHours(0);
    today.setMinutes(0);
    today.setSeconds(0);

    const m = moment(today);
    const now = moment();
    const seconds = now.unix() - m.unix();
    return seconds;
};

exports.plural = function (word, count) {
    return Math.abs(count) == 1 ? word : word + 's';
};

exports.stringToObject = function (string) {
    const object = exports.parseJSON('{"' + string.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
    return object;
};

exports.parseJSON = function (string) {
    try {
        return JSON.parse(string);
    } catch (err) {
        return null;
    }
};

exports.capitalizeFirst = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

exports.capitalizeEach = function (string) {
    return string.replace(/\w\S*/g, function (word) {
        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
    });
};

exports.between = function (x, min, max) {
    return x >= min && x <= max;
};

exports.request = {
    get: function (options, callback) {
        options.method = 'GET';
        request(options, function (err, response, body) {
            if (err) {
                callback(err);
                return;
            }

            if (response.statusCode != 200) {
                err = new Error('HTTP Error: ' + response.statusCode);
                err.statusCode = response.statusCode;
                callback(new Error(err));
                return;
            }

            if (!body || typeof body != 'object') {
                callback(new Error('Invalid API response'));
                return;
            }

            callback(null, body);
        });
    }
};

exports.currencyAsText = function (currencies) {
    let text = '';

    if (currencies.keys && currencies.keys != 0) {
        text = currencies.keys + ' ' + exports.plural('key', currencies.keys);
    }
    if (currencies.metal && currencies.metal != 0) {
        if (text != '') {
            text += ', ';
        }
        text += (decimalPlaces(currencies.metal) == 2 ? currencies.metal : exports.trunc(currencies.metal, 2)) + ' ref';
    }
    if (text == '') {
        return '0 keys, 0 ref';
    }

    return text;
};

function decimalPlaces (num) {
    const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) {
        return 0;
    }

    return Math.max(
        0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        - (match[2] ? +match[2] : 0));
}

exports.scrapToRefined = function (scrap) {
    const refined = exports.trunc(scrap / 9, 2);
    return refined;
};

exports.trunc = function (number, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.floor(number * factor) / factor;
};

exports.refinedToScrap = function (refined) {
    const scrap = round(refined * 9, 0.5);
    return scrap;
};

function round (value, step = 1) {
    const inv = 1.0 / step;
    return Math.round(value * inv) / inv;
}
