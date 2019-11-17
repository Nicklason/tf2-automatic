const SteamUser = require('steam-user');

const generateAuthCode = require('utils/generateAuthCode');

const community = require('lib/community');
const loginAttempts = require('app/login-attempts');

const handlerManager = require('app/handler-manager');

const client = new SteamUser();

let hasCookies = false;
let consecutiveSteamGuardCodesWrong = 0;

client.on('friendMessage', friendMessageEvent);
client.on('friendRelationship', friendRelationshipEvent);
client.on('webSession', webSessionEvent);
client.on('steamGuard', steamGuardEvent);
client.on('loginKey', loginKeyEvent);
client.on('error', errorEvent);

function friendMessageEvent (steamID, message) {
    if (message.startsWith('[tradeoffer sender=') && message.endsWith('[/tradeoffer]')) {
        // Ignore messages sent when a user sends a trade offer
        return;
    }

    handlerManager.getHandler().onMessage(steamID, message);
}

function friendRelationshipEvent (steamID, relationship) {
    handlerManager.getHandler().onFriendRelationship(steamID, relationship);
}

// TODO: Handle setCookies error
function webSessionEvent (sessionID, cookies) {
    // TODO: Have a callback function that waits for the websession event

    // Technically not needed, but will keep it anyway just to be safe
    community.setCookies(cookies);

    if (hasCookies) {
        // First time the event is fired we won't set the cookies
        require('lib/manager').setCookies(cookies, function (err) {
            if (err) {
                throw err;
            }
        });
    } else {
        hasCookies = true;
    }
}

// TODO: Handle generateAuthCode error
function steamGuardEvent (domain, callback, lastCodeWrong) {
    if (lastCodeWrong === true) {
        consecutiveSteamGuardCodesWrong++;
    } else {
        consecutiveSteamGuardCodesWrong = 0;
    }

    if (consecutiveSteamGuardCodesWrong >= 2) {
        // Too many logins will trigger this error because steam returns TwoFactorCodeMismatch
        throw new Error('Too many wrong Steam Guard codes');
    }

    let wait = loginAttempts.wait();

    if (wait === 0 && consecutiveSteamGuardCodesWrong > 0) {
        // 30000 ms wait for TwoFactorCodeMismatch is enough to not get ratelimited
        wait = 30000 * consecutiveSteamGuardCodesWrong;
    }

    if (wait !== 0) {
        handlerManager.getHandler().onLoginThrottle(wait);
    }

    setTimeout(function () {
        generateAuthCode(function (err, authCode) {
            // Ignore errors

            loginAttempts.newAttempt();

            callback(authCode);
        });
    }, wait);
}

function loginKeyEvent (loginKey) {
    handlerManager.getHandler().onLoginKey(loginKey);
}

function errorEvent (err) {
    throw err;
}

module.exports = client;
