const SteamUser = require('steam-user');
const request = require('request');
const moment = require('moment');

const utils = require('./utils.js');

let Automatic;
let client;
let community;
let manager;
let log;
let config;

let FRIEND_DETAILS = {};

exports.register = function (automatic) {
    Automatic = automatic;
    client = automatic.client;
    community = automatic.community;
    manager = automatic.manager;
    log = automatic.log;
    config = automatic.config;
};

exports.init = function () {
    client.on('friendRelationship', function (steamID, relationship) {
        const steamID64 = steamID.getSteamID64();
        if (relationship == SteamUser.Steam.EFriendRelationship.Friend) {
            log.info('I am now friends with ' + steamID64);
            friendAddResponse(steamID64);
            if (Automatic.hasOwnProperty('maxFriends') && getFriends().length + 1 >= Automatic.maxFriends) {
                removeRandomFriend(steamID64); // Don't remove the user who just friended the bot
            }
        } else if (relationship == SteamUser.Steam.EFriendRelationship.RequestRecipient) {
            log.info(steamID64 + ' added me');
            addFriend(steamID64); // Add them back
        }
    });

    checkFriendRequests();
};

function addFriend (steamID64) {
    log.debug('Sending friend request to ' + steamID64 + ' or accepting their friend request...');
    client.addFriend(steamID64, function (err) {
        if (err) {
            log.warn('Failed to send a friend request (' + err.message + ')');
            log.debug(err.stack);
        }
    });
}

function getFriendsToKeep () {
    let friendsToKeep = [].concat(config.get('friendsToKeep'));
    const owners = config.get('owners');
    for (let i = 0; i < owners.length; i++) {
        const steamid64 = owners[i];
        if (friendsToKeep.indexOf(steamid64) === -1) {
            friendsToKeep.push(steamid64);
        }
    }

    return friendsToKeep;
}

function removeRandomFriend (ignore) {
    let friendsToKeep = getFriendsToKeep();
    if (ignore !== undefined && friendsToKeep.indexOf(ignore) === -1) {
        friendsToKeep.push(ignore);
    }

    const friends = getFriends().filter((steamid64) => friendsToKeep.indexOf(steamid64));
    if (friends.length === 0) {
        return;
    }

    const index = Math.floor(Math.random() * friends.length);
    const remove = friends[index];

    Automatic.message(remove, 'You\'ve been randomly selected to be removed.');
    removeFriend(remove);
}

function getMaxFriends (callback) {
    if (callback === undefined) {
        callback = utils.void;
    }

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

        const maxFriends = base + level * multiplier;

        Automatic.maxFriends = maxFriends;

        if (getFriends().length + 1 >= Automatic.maxFriends) {
            removeRandomFriend();
        }

        callback(null, maxFriends);
    });
}

function getFriends () {
    const friends = [];
    for (const steamID64 in client.myFriends) {
        if (!client.myFriends.hasOwnProperty(steamID64)) {
            continue;
        }

        const relation = client.myFriends[steamID64];
        if (relation == SteamUser.Steam.EFriendRelationship.Friend) {
            friends.push(steamID64);
        }
    }

    return friends;
}

function removeFriend (steamID64) {
    client.removeFriend(steamID64, function (err) {
        if (err) {
            log.warn('Failed to remove friend (' + err.message + ')');
            log.debug(err.stack);
        }
    });
}

function checkFriendRequests () {
    if (!client.myFriends) {
        return;
    }

    for (const steamID64 in client.myFriends) {
        if (!client.myFriends.hasOwnProperty(steamID64)) {
            continue;
        }

        const relation = client.myFriends[steamID64];
        if (relation == SteamUser.Steam.EFriendRelationship.RequestRecipient) {
            addFriend(steamID64);
        }
    }
}

function friendAddResponse (steamID64) {
    getDetails(steamID64, function (err, details) {
        if (err) {
            Automatic.message(steamID64, 'Hi! If you don\'t know how things work, please type "!help" :)');
        } else {
            Automatic.message(steamID64, 'Hi ' + details.personaname + '! If you don\'t know how things work, please type "!help" :)');
        }
    });
}

function isFriend (steamID64) {
    const friends = getFriends();
    for (let i = 0; i < friends.length; i++) {
        if (friends[i] == steamID64) {
            return true;
        }
    }
    return false;
}

function inviteToGroups (steamID64) {
    if (!isFriend(steamID64)) {
        return;
    }

    const groups = config.get('groups');

    for (let i = 0; i < groups.length; i++) {
        community.inviteUserToGroup(steamID64, groups[i]);
    }
}

function requestDetails (steamID64, callback) {
    request({
        uri: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
        method: 'GET',
        json: true,
        gzip: true,
        qs: {
            key: manager.apiKey,
            steamids: steamID64
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

        let details = body.response.players[0];
        delete details.steamid;
        details.time = moment().unix();

        FRIEND_DETAILS[steamID64] = details;

        callback(null, details);
    });
}

function detailsCleanup () {
    // Remove old details
    for (let i in FRIEND_DETAILS) {
        if (isOldDetails(FRIEND_DETAILS[i])) {
            delete FRIEND_DETAILS[i];
        }
    }
}

function isOldDetails (details) {
    const current = moment().unix();
    const max = 3600; // 1 hour

    return current - details.time > max;
}

function getDetails (steamID64, callback) {
    const details = FRIEND_DETAILS[steamID64];
    if (!details || isOldDetails(details)) {
        detailsCleanup();
        requestDetails(steamID64, callback);
        return;
    }

    callback(null, details);
}

function alert (steamID64, alert) {
    Automatic.message(steamID64, 'Your trade was ' + alert.status + '. Reason: ' + alert.reason + '.');
}

exports.alert = alert;
exports.isFriend = isFriend;
exports.all = getFriends;
exports.remove = removeFriend;
exports.getDetails = getDetails;
exports.sendGroupInvites = inviteToGroups;
exports.getLimit = getMaxFriends;
exports.toKeep = getFriendsToKeep;
