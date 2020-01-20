import request from '@nicklason/request-retry';

import pjson from 'pjson';

export function getSchema (callback) {
    apiRequest('GET', '/schema', { appid: 440 }, callback);
};

export function getPricelist (source, callback) {
    apiRequest('GET', '/items', { src: source }, callback);
};

export function getPrice (sku, source, callback) {
    apiRequest('GET', `/items/${sku}`, { src: source }, callback);
};

export function requestCheck (sku, source, callback) {
    apiRequest('POST', `/items/${sku}`, { source: source }, callback);
};

function apiRequest (httpMethod, path, input, callback) {
    const options = {
        method: httpMethod,
        url: `https://api.prices.tf${path}`,
        headers: {
            'User-Agent': pjson.name + '@' + pjson.version
        },
        json: true,
        gzip: true,
        timeout: 30000
    };

    if (process.env.PRICESTF_API_KEY) {
        //@ts-ignore
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
