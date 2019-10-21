const client = require('lib/client');

/**
 * Signs in to Steam and catches login error
 * @param {Function} callback
 */
module.exports = function (callback) {
    const listeners = client.listeners('error');

    client.removeAllListeners('error');

    client.logOn({
        accountName: process.env.STEAM_ACCOUNT_NAME,
        password: process.env.STEAM_PASSWORD
    });

    client.on('loggedOn', loggedOnEvent);
    client.on('error', errorEvent);

    function loggedOnEvent () {
        client.off('error', errorEvent);
        gotEvent();
    }

    function errorEvent (err) {
        client.off('loggedOn', loggedOnEvent);
        gotEvent(err);
    }

    function gotEvent (err) {
        listeners.forEach(function (listener) {
            client.on('error', listener);
        });

        callback(err);
    }
};
