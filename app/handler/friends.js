const SteamUser = require('steam-user');

const client = require('lib/client');
const log = require('lib/logger');

exports.friendRelationChanged = function (steamID, relationship) {
    if (relationship === SteamUser.EFriendRelationship.Friend) {
        onNewFriend(steamID);
    } else if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
        respondToFriendRequest(steamID);
    }
};

function onNewFriend (steamID) {
    const friend = exports.getFriend(steamID);
    log.info('I am now friends with ' + friend.player_name + ' (' + steamID.getSteamID64() + ')');

    client.chatMessage(steamID, 'Hi ' + friend.player_name + '! If you don\'t know how things work, please type "!help" :)');

    // TODO: Check max friends
}

function respondToFriendRequest (steamID) {
    // Maybe just overwrite the SteamUser.prototype.addFriend function like with sending messages?

    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    log.debug('Sending friend request to ' + steamID64 + '...');

    client.addFriend(steamID, function (err) {
        if (err) {
            log.warn('Failed to send friend request to ' + steamID64, err);
            return;
        }

        log.debug('Friend request has been sent');
    });
}

exports.getFriend = function (steamID) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    const friend = client.users[steamID64];
    return friend === undefined ? null : friend;
};
