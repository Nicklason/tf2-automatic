const SteamUser = require('steam-user');
const request = require('request');
const SteamID = require('steamid');

const manager = require('lib/manager');
const client = require('lib/client');
const log = require('lib/logger');
const trades = require('handler/trades');

const admin = require('app/admins');
const backoff = require('utils/exponentialBackoff');

const friendsToKeep = (process.env.KEEP === undefined ? [] : JSON.parse(process.env.KEEP)).concat(admin.getAdmins());

friendsToKeep.forEach(function (steamid64) {
    if (!new SteamID(steamid64).isValid()) {
        throw new Error('Invalid SteamID64 "' + steamid64 + '"');
    }
});

let maxFriends = null;

exports.getMaxFriends = function (callback) {
    request({
        uri: 'https://api.steampowered.com/IPlayerService/GetBadges/v1/',
        method: 'GET',
        json: true,
        gzip: true,
        qs: {
            key: manager.apiKey,
            steamid: client.steamID.getSteamID64()
        }
    }, function (err, response, body) {
        if (err) {
            callback(err);
            return;
        }

        if (response.statusCode > 299 || response.statusCode < 199) {
            err = new Error('HTTP error ' + response.statusCode);
            err.code = response.statusCode;
            callback(err, response, body);
            return err;
        }

        if (!body || typeof body != 'object') {
            callback(new Error('Invalid response'));
            return;
        }

        const result = body.response;
        const level = result.player_level;

        const base = 250;
        const multiplier = 5;

        maxFriends = base + level * multiplier;

        callback(null, maxFriends);
    });
};

exports.checkFriendRequests = function () {
    if (!client.myFriends) {
        return;
    }

    checkFriendsCount();

    for (const steamID64 in client.myFriends) {
        if (!Object.prototype.hasOwnProperty.call(client.myFriends, steamID64)) {
            continue;
        }

        const relation = client.myFriends[steamID64];
        if (relation === SteamUser.EFriendRelationship.RequestRecipient) {
            respondToFriendRequest(steamID64);
        }
    }

    admin.getAdmins().forEach(function (steamID) {
        if (!exports.isFriend(steamID)) {
            log.info('Not friends with admin ' + steamID + ', sending friend request...');
            client.addFriend(steamID, function (err) {
                if (err) {
                    log.warn('Failed to send friend request: ', err);
                    return;
                }
            });
        }
    });
};

function getFriends () {
    const friends = [];
    for (const steamID in client.myFriends) {
        if (!Object.prototype.hasOwnProperty.call(client.myFriends, steamID)) {
            continue;
        }

        const relation = client.myFriends[steamID];
        if (relation === SteamUser.EFriendRelationship.Friend) {
            friends.push(steamID);
        }
    }

    return friends;
}

function checkFriendsCount (steamIDToIgnore) {
    const friends = getFriends();

    const friendslistBuffer = 20;

    const friendsToRemoveCount = friends.length + friendslistBuffer - maxFriends;

    if (friendsToRemoveCount > 0) {
        // We have friends to remove, find people with fewest trades and remove them
        const friendsWithTrades = trades.getTradesWithPeople(friends);

        // Ignore friends to keep
        friendsToKeep.forEach(function (steamID) {
            delete friendsWithTrades[steamID];
        });

        if (steamIDToIgnore) {
            delete friendsWithTrades[steamIDToIgnore];
        }

        // Convert object into an array so it can be sorted
        const tradesWithPeople = [];

        for (const steamID in friendsWithTrades) {
            if (!Object.prototype.hasOwnProperty.call(friendsWithTrades, steamID)) {
                continue;
            }

            tradesWithPeople.push({ steamID: steamID, trades: friendsWithTrades[steamID] });
        }

        // Sorts people by trades and picks people with lowest amounts of trades
        const friendsToRemove = tradesWithPeople.sort((a, b) => a.trades - b.trades).splice(0, friendsToRemoveCount);

        log.info('Cleaning up friendslist, removing ' + friendsToRemove.length + ' people...');

        friendsToRemove.forEach(function (element) {
            client.chatMessage(element.steamID, 'I am cleaning up my friendslist and you have been selected to be removed.');
            client.removeFriend(element.steamID);
        });
    }
}

exports.friendRelationChanged = function (steamID, relationship) {
    if (relationship === SteamUser.EFriendRelationship.Friend) {
        onNewFriend(steamID);
        checkFriendsCount(steamID);
    } else if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
        respondToFriendRequest(steamID);
    }
};

function onNewFriend (steamID, tries = 0) {
    if (tries === 0) {
        log.debug('Now friends with ' + steamID.getSteamID64());
    }

    setImmediate(function () {
        if (!exports.isFriend(steamID)) {
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

            log.debug('Waiting for name');

            // Wait for friend info to be available
            setTimeout(function () {
                onNewFriend(steamID, tries);
            }, backoff(tries - 1, 200));
            return;
        }

        log.info('I am now friends with ' + friend.player_name + ' (' + steamID.getSteamID64() + ')');

        client.chatMessage(steamID, 'Hi ' + friend.player_name + '! If you don\'t know how things work, please type "!help" :)');

        // TODO: Check max friends
    });
}

function respondToFriendRequest (steamID) {
    // Maybe just overwrite the SteamUser.prototype.addFriend function like with sending messages?

    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    log.debug('Sending friend request to ' + steamID64 + '...');

    client.addFriend(steamID, function (err) {
        if (err) {
            log.warn('Failed to send friend request to ' + steamID64 + ': ', err);
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
