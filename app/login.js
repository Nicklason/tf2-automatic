const SteamTotp = require('steam-totp');

let client;

exports.register = function(automatic) {
    client = automatic.client;
};

exports.performLogin = performLogin;

function performLogin(details, callback) {
    let logOnOptions = {
        accountName: details.name,
        password: details.password
    };

    SteamTotp.getTimeOffset(function (err, offset) {
        if (err) {
            callback(err);
            return;
        }

        logOnOptions.twoFactorCode = SteamTotp.getAuthCode(details.shared_secret, offset);
        
        client.logOn(logOnOptions);

        callback(null);
    });
}