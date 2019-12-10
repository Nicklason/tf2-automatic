const TeamFortress2 = require('tf2');

const log = require('lib/logger');
const client = require('lib/client');

const tf2 = new TeamFortress2(client);

tf2.on('connectedToGC', function (version) {
    log.debug('Connected to the TF2 Game Coordinator', { event: 'connectedToGC', from: 'tf2', version: version });
});

tf2.on('disconnectedFromGC', function (reason) {
    log.debug('Disconnected from the TF2 Game Coordinator', { event: 'disconnectedFromGC', from: 'tf2', reason: reason });
});

tf2.on('systemMessage', function (message) {
    log.debug('System message', { event: 'systemMessage', message: message });
});

tf2.on('accountLoaded', function () {
    log.debug('Account loaded', { event: 'accountLoaded', from: 'tf2' });
});

tf2.on('accountUpdate', function (oldData) {
    log.debug('Account updated', { event: 'accountUpdate', from: 'tf2', old_data: oldData });
});

tf2.on('itemAcquired', function (item) {
    log.debug('New item acquired', { event: 'itemAcquired', from: 'tf2', item: item });
});

tf2.on('itemChanged', function (oldItem, newItem) {
    log.debug('Item changed', { event: 'itemChanged', from: 'tf2', old_item: oldItem, new_item: newItem });
});

tf2.on('itemRemoved', function (item) {
    log.debug('Item removed', { event: 'itemRemoved', from: 'tf2', item: item });
});

tf2.on('craftingComplete', function (recipe, itemsGained) {
    log.debug('Crafting completed', { event: 'craftingComplete', from: 'tf2', recipe: recipe, gained: itemsGained });
});

/* tf2.on('debug', function (message) {
    log.debug(message, { event: 'debug', from: 'node-tf2' });
}); */

module.exports = tf2;
