const Schema = require('tf2-schema');
const request = require('@nicklason/request-retry');

const socket = require('lib/ptf-socket');

const handlerManager = require('app/handler-manager');

const package = require('@root/package.json');

const schemaManager = new Schema({ updateTime: -1 });

socket.on('schema', function () {
    fetchSchema(function (err, schema) {
        if (!err) {
            schemaManager.setSchema(schema, true);
        }
    });
});

schemaManager.on('schema', function (schema) {
    handlerManager.getHandler().onSchema(schema);
});

// Overwrite getSchema method to pull the schema from PricesTF
schemaManager.getSchema = function (callback) {
    fetchSchema((err, schema) => {
        if (err) {
            return callback(err);
        }

        this.setSchema(schema, true);

        callback(null, this.schema);
    });
};

module.exports = schemaManager;

function fetchSchema (callback) {
    const headers = {
        'User-Agent': package.name + '@' + package.version
    };

    if (process.env.PRICESTF_API_TOKEN !== undefined) {
        headers.Authorization = `Token ${process.env.PRICESTF_API_TOKEN}`;
    }

    request({
        method: 'GET',
        url: 'https://api.prices.tf/schema',
        qs: {
            appid: 440
        },
        headers: headers,
        json: true,
        gzip: true
    }, function (err, response, body) {
        if (err) {
            return callback(err);
        }

        delete body.success;
        return callback(null, body);
    });
}
