const client = require('lib/client');

exports.getFriend = function (steamID64) {
    const friend = client.users[steamID64];
    return friend === undefined ? null : friend;
};
