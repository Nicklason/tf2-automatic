const SteamUser = require('steam-user');

const generateAuthCode = require('utils/generateAuthCode');

const community = require('lib/community');

const client = new SteamUser();

let consecutiveSteamGuardCodesWrong = 0;

client.on('webSession', webSessionEvent);
client.on('steamGuard', steamGuardEvent);
client.on('error', errorEvent);

// TODO: Handle setCookies error
function webSessionEvent (sessionID, cookies) {
    // TODO: Have a callback function that waits for the websession event

    // Technically not needed, but will keep it anyway just to be safe
    community.setCookies(cookies);

    require('lib/manager').setCookies(cookies, function (err) {
        if (err) {
            throw err;
        }
    });
}

// TODO: Handle generateAuthCode error
function steamGuardEvent (domain, callback, lastCodeWrong) {
    if (lastCodeWrong === true) {
        consecutiveSteamGuardCodesWrong++;
    } else {
        consecutiveSteamGuardCodesWrong = 0;
    }

    if (consecutiveSteamGuardCodesWrong >= 2) {
        throw new Error('Too many wrong Steam Guard codes');
    }

    generateAuthCode(function (err, authCode) {
        if (err) {
            throw err;
        }

        callback(authCode);
    });
}

function errorEvent (err) {
    throw err;
}

module.exports = client;
