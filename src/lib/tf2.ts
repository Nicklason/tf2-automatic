const TeamFortress2 = require('tf2');

const log = require('./logger');
const client = require('./client');

const tf2 = new TeamFortress2(client);

tf2.on('connectedToGC', function (version) {
    log.debug('Connected to the TF2 Game Coordinator', { event: 'connectedToGC', from: 'tf2', version: version });
});

tf2.on('disconnectedFromGC', function (reason) {
    log.debug('Disconnected from the TF2 Game Coordinator', { event: 'disconnectedFromGC', from: 'tf2', reason: reason });
});

/* tf2.on('debug', function (message) {
    log.debug(message, { event: 'debug', from: 'node-tf2' });
}); */

export default tf2;
