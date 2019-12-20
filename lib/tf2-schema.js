const Schema = require('tf2-schema');

const log = require('lib/logger');
const socket = require('lib/ptf-socket');
const api = require('lib/ptf-api');

const handlerManager = require('app/handler-manager');

const schemaManager = new Schema({ updateTime: -1 });

socket.on('schema', function () {
    // Emitted when pricestf's version of the schema has been updated
    log.debug('TF2 schema has updated', { event: 'schema', from: 'socket.io-client' });

    // The schema has updated, fetch it
    api.getSchema(function (err, schema) {
        if (err) {
            log.debug('Failed to update schema', err);
            return;
        }

        schemaManager.setSchema(schema, true);
    });
});

schemaManager.on('schema', function (schema) {
    // Schema was updated within out instance of tf2-schema, emit it
    handlerManager.getHandler().onSchema(schema);
});

// Replace getSchema function to pull the schema from pricestf
schemaManager.getSchema = function (callback) {
    api.getSchema((err, schema) => {
        if (err) {
            return callback(err);
        }

        this.setSchema(schema, true);

        callback(null, this.schema);
    });
};

module.exports = schemaManager;
