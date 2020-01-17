const SteamUser = require('steam-user');

const log = require('lib/logger');

const generateAuthCode = require('utils/generateAuthCode');

const loginAttempts = require('app/login-attempts');
const handlerManager = require('app/handler-manager');

const client = new SteamUser();

const chatMessage = SteamUser.prototype.chatMessage;

let sessionReplaceCount = 0;

setInterval(function () {
    sessionReplaceCount = 0;
}, 60 * 1000);

SteamUser.prototype.chatMessage = function (steamID, message) {
    chatMessage.call(client, steamID, message);

    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    const friend = require('handler/friends').getFriend(steamID);

    if (friend === null) {
        log.info('Message sent to ' + steamID64 + ': ' + message);
    } else {
        log.info('Message sent to ' + friend.player_name + ' (' + steamID64 + '): ' + message);
    }
};

let hasCookies = false;
let consecutiveSteamGuardCodesWrong = 0;

client.on('loggedOn', loggedOnEvent);
client.on('friendMessage', friendMessageEvent);
client.on('friendRelationship', friendRelationshipEvent);
client.on('groupRelationship', groupRelationshipEvent);
client.on('webSession', webSessionEvent);
client.on('steamGuard', steamGuardEvent);
client.on('loginKey', loginKeyEvent);
client.on('error', errorEvent);

function loggedOnEvent () {
    log.info('Signed in to Steam!');

    handlerManager.getHandler().onLogin();
}

function friendMessageEvent (steamID, message) {
    if (message.startsWith('[tradeoffer sender=') && message.endsWith('[/tradeoffer]')) {
        // Ignore messages sent when a user sends a trade offer
        return;
    }

    if (!handlerManager.isReady() || handlerManager.isShuttingDown()) {
        return;
    }

    handlerManager.getHandler().onMessage(steamID, message);
}

function friendRelationshipEvent (steamID, relationship) {
    if (!handlerManager.isReady() || handlerManager.isShuttingDown()) {
        return;
    }

    handlerManager.getHandler().onFriendRelationship(steamID, relationship);
}

function groupRelationshipEvent (steamID, relationship) {
    if (!handlerManager.isReady() || handlerManager.isShuttingDown()) {
        return;
    }

    handlerManager.getHandler().onGroupRelationship(steamID, relationship);
}

// TODO: Handle setCookies error
function webSessionEvent (sessionID, cookies) {
    log.debug('New web session', { event: 'webSession', from: 'steam-user', session_id: sessionID, cookies: cookies, private: true });

    require('lib/community').setCookies(cookies);

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

function steamGuardEvent (domain, callback, lastCodeWrong) {
    log.debug('Steam guard code is requested', { event: 'steamGuard', from: 'steam-user', domain: domain, lastCodeWrong: lastCodeWrong, consecutiveSteamGuardCodesWrong: consecutiveSteamGuardCodesWrong });

    if (lastCodeWrong === false) {
        consecutiveSteamGuardCodesWrong = 0;
    }

    consecutiveSteamGuardCodesWrong++;

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
    if (err.eresult === SteamUser.EResult.LogonSessionReplaced) {
        sessionReplaceCount++;

        if (sessionReplaceCount > 0) {
            log.warn('Detected login session replace loop, stopping bot...');
            handlerManager.getHandler().shutdown(err, true);
            return;
        }

        log.warn('Login session replaced, relogging...');

        require('app/login')(null, function (err) {
            if (err) {
                throw err;
            }
        });
    } else if (err.eresult === SteamUser.EResult.LoggedInElsewhere) {
        log.warn('Signed in elsewhere, stopping the bot...');
        handlerManager.getHandler().shutdown(err, true);
    } else {
        throw err;
    }
}

module.exports = client;
