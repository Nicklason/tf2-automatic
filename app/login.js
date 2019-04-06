const SteamTotp = require('steam-totp');

let client;

exports.register = function (automatic) {
    client = automatic.client;
};

exports.performLogin = performLogin;

exports.getAuthCode = getAuthCode;

function performLogin (details, callback) {
    const logOnOptions = {
        accountName: details.name,
        password: details.password
    };

    client.logOn(logOnOptions);
}

function getAuthCode (sharedSecret, callback) {
    SteamTotp.getTimeOffset(function (err, offset) {
        if (err) {
            callback(err);
            return;
        }

        const code = SteamTotp.getAuthCode(sharedSecret, offset);

        callback(null, code);
    });
}
