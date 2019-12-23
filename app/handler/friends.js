const SteamUser = require('steam-user');

const client = require('lib/client');
const log = require('lib/logger');

const backoff = require('utils/exponentialBackoff');

exports.checkFriendRequests = function () {
    if (!client.myFriends) {
        return;
    }

    for (const steamID64 in client.myFriends) {
        if (!Object.prototype.hasOwnProperty.call(client.myFriends, steamID64)) {
            continue;
        }

        const relation = client.myFriends[steamID64];
        if (relation === SteamUser.EFriendRelationship.RequestRecipient) {
            respondToFriendRequest(steamID64);
        }
    }
};

exports.friendRelationChanged = function (steamID, relationship) {
    if (relationship === SteamUser.EFriendRelationship.Friend) {
        onNewFriend(steamID);
    } else if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
        respondToFriendRequest(steamID);
    }
};

function onNewFriend (steamID, tries = 0) {
    if (tries === 0) {
        log.debug('Now friends with ' + steamID.getSteamID64());
    }

    if (!exports.isFriend(steamID) && client.myFriends[steamID.getSteamID64()] !== SteamUser.EFriendRelationship.RequestRecipient) {
        return;
    }

    const friend = exports.getFriend(steamID);

    if (friend === null || friend.player_name === undefined) {
        tries++;

        if (tries >= 5) {
            log.info('I am now friends with ' + steamID.getSteamID64());

            client.chatMessage(steamID, 'Hi! If you don\'t know how things work, please type "!help" :)');
            return;
        }

        // Wait for friend info to be available
        setTimeout(function () {
            onNewFriend(steamID);
        }, backoff(tries - 1, 100));
        return;
    }

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

        log.debug('Friend request has been sent / accepted');
    });
}

exports.isFriend = function (steamID) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    const relation = client.myFriends[steamID64];

    return relation === SteamUser.EFriendRelationship.Friend;
};

exports.getFriend = function (steamID) {
    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    const friend = client.users[steamID64];
    return friend === undefined ? null : friend;
};
