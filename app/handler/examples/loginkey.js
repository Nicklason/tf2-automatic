/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const LOGIN_KEY_PATH = path.join(__dirname, '../loginkey.txt');

exports.onRun = function (done) {
    console.log('The bot is starting...');

    let loginKey = null;

    if (fs.existsSync(LOGIN_KEY_PATH)) {
        console.log('Found saved login key');
        loginKey = fs.readFileSync(LOGIN_KEY_PATH).toString('utf8');
    }

    done({ loginKey: loginKey });
};

exports.onShutdown = function (done) {
    console.log('The bot is stopping...');

    done();
};

exports.onReady = function () {
    console.log('Everything is ready!');
};

exports.onLoginThrottle = function (wait) {
    console.log('Waiting ' + wait + ' ms before trying to sign in...');
};

exports.onLoginSuccessful = function () {
    console.log('Logged into Steam!');
};

exports.onLoginFailure = function (err) {
    console.log('An error occurred while trying to sign into Steam: ' + err.message);

    exports.shutdown();
};

exports.onLoginKey = function (loginKey) {
    console.log('Got login key, saving it');
    fs.writeFileSync(LOGIN_KEY_PATH, loginKey);
};

exports.onTradeOfferUpdated = function (offer, oldState) {};

exports.onPollData = function (pollData) {};

exports.onSchema = function (schema) {};

exports.onLoginAttempts = function (attempts) {};
