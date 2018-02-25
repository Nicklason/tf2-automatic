const request = require('request');

exports.fatal = function (log, msg) {
    log.error(msg);
    process.exit(1);
};

exports.epoch = function () {
    let seconds = parseInt(Math.round(new Date().getTime() / 1000));
    return seconds;
};

exports.plural = function (word, count) {
    return count == 1 ? word : word + 's';
};

exports.stringToObject = function (string) {
    let object = exports.parseJSON('{"' + string.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
    return object;
};

exports.parseJSON = function (string) {
    try {
        return JSON.parse(string);
    } catch (err) {
        return null;
    }
};

exports.request = {
    get: function (options, callback) {
        options.method = "GET";
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
    var text = '';

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

function decimalPlaces(num) {
    var match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) { return 0; }
    return Math.max(
        0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        - (match[2] ? +match[2] : 0));
}

exports.scrapToRefined = function (scrap) {
    var refined = exports.trunc(scrap / 9, 2);
    return refined;
};

exports.trunc = function (number, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.floor(number * factor) / factor;
};

exports.refinedToScrap = function (refined) {
    var scrap = round(refined * 9, 0.5);
    return scrap;
};

exports.addRefined = function(base, add, amount = 1) {
    const baseValue = exports.refinedToScrap(base);
    const addValue = exports.refinedToScrap(add) * amount;
    const value = baseValue + addValue;
    return exports.scrapToRefined(value);
};

function round(value, step = 1) {
    var inv = 1.0 / step;
    return Math.round(value * inv) / inv;
}