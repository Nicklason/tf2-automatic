const log = require('lib/logger');
const client = require('lib/client');

const loginAttempts = require('app/login-attempts');
const handlerManager = require('app/handler-manager');

const REQUIRED_OPTS = ['STEAM_ACCOUNT_NAME', 'STEAM_PASSWORD', 'STEAM_SHARED_SECRET', 'STEAM_IDENTITY_SECRET'];

/**
 * Signs in to Steam and catches login error
 * @param {String} loginKey
 * @param {Function} callback
 */
module.exports = function (loginKey, callback) {
    log.debug('Starting login attempt', { login_key: loginKey });

    REQUIRED_OPTS.forEach(function (optName) {
        if (!process.env[optName]) {
            throw new Error('Missing ' + optName.slice(6).toLowerCase().replace(/_/g, ' '));
        }
    });

    const wait = loginAttempts.wait();

    if (wait !== 0) {
        log.debug('Waiting ' + wait + ' ms before trying to sign in');
        handlerManager.getHandler().onLoginThrottle(wait);
    }

    setTimeout(function () {
        const listeners = client.listeners('error');

        client.removeAllListeners('error');

        const opts = {
            accountName: process.env.STEAM_ACCOUNT_NAME
        };

        if (loginKey !== null) {
            log.debug('Signing in using login key');
            opts.loginKey = loginKey;
        } else {
            log.debug('Signing in using password');
            opts.password = process.env.STEAM_PASSWORD;
        }

        opts.logonID = Math.round(Math.random() * 69420);
        opts.rememberPassword = true;

        loginAttempts.newAttempt();

        client.logOn(opts);

        client.once('loggedOn', loggedOnEvent);
        client.once('error', errorEvent);

        function loggedOnEvent () {
            client.removeListener('error', errorEvent);

            log.debug('Signed in to Steam');

            gotEvent();
        }

        function errorEvent (err) {
            client.removeListener('loggedOn', loggedOnEvent);

            log.debug('Failed to sign in to Steam', err);

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
