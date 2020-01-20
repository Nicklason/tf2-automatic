const request = require('@nicklason/request-retry');

const package = require('../package.json');

exports.getSchema = function (callback) {
    apiRequest('GET', '/schema', { appid: 440 }, callback);
};

exports.getPricelist = function (source, callback) {
    apiRequest('GET', '/items', { src: source }, callback);
};

exports.getPrice = function (sku, source, callback) {
    apiRequest('GET', `/items/${sku}`, { src: source }, callback);
};

exports.requestCheck = function (sku, source, callback) {
    apiRequest('POST', `/items/${sku}`, { source: source }, callback);
};

function apiRequest (httpMethod, path, input, callback) {
    const options = {
        method: httpMethod,
        url: `https://api.prices.tf${path}`,
        headers: {
            'User-Agent': package.name + '@' + package.version
        },
        json: true,
        gzip: true,
        timeout: 30000
    };

    if (process.env.PRICESTF_API_KEY) {
        options.headers.Authorization = `Token ${process.env.PRICESTF_API_KEY}`;
    }

    options[httpMethod === 'GET' ? 'qs' : 'body'] = input;

    request(options, function (err, response, body) {
        if (err) {
            return callback(err);
        }

        callback(null, body);
    });
}
