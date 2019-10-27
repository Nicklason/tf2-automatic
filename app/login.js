const client = require('lib/client');
const loginAttempts = require('app/login-attempts');
const handlerManager = require('app/handler-manager');

/**
 * Signs in to Steam and catches login error
 * @param {String} loginKey
 * @param {Function} callback
 */
module.exports = function (loginKey, callback) {
    const wait = loginAttempts.wait();

    if (wait !== 0) {
        handlerManager.getHandler().onLoginThrottle(wait);
    }

    setTimeout(function () {
        const listeners = client.listeners('error');

        client.removeAllListeners('error');

        const opts = {
            accountName: process.env.STEAM_ACCOUNT_NAME
        };

        if (loginKey !== null) {
            opts.loginKey = loginKey;
        } else {
            opts.password = process.env.STEAM_PASSWORD;
            opts.rememberPassword = true;
        }

        loginAttempts.newAttempt();

        client.logOn(opts);

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
    }, wait);
};
