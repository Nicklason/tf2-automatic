const SteamUser = require('steam-user');
const SteamID = require('steamid');

const log = require('../../lib/logger');
const client = require('../../lib/client');
const community = require('../../lib/community');
const friends = require('../handler/friends');

const groups = process.env.GROUPS === undefined ? [] : JSON.parse(process.env.GROUPS);

groups.forEach(function (steamid64) {
    if (!new SteamID(steamid64).isValid()) {
        throw new Error('Invalid group SteamID64 "' + steamid64 + '"');
    }
});

exports.inviteToGroups = function (steamID) {
    if (!friends.isFriend(steamID)) {
        return;
    }

    const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

    log.debug('Inviting user to groups...');

    groups.forEach(function (groupID64) {
        log.debug('Inviting to ' + groupID64);
        community.inviteUserToGroup(steamID, groupID64, function (err) {
            if (err && err.message !== 'HTTP error 400') {
                log.warn('Failed to invite ' + steamID64 + ' to group ' + groupID64 + ': ', err);
            }
        });
    });
};

exports.groupRelationChanged = function (steamID, relationship) {
    log.debug('Group relation changed', { steamID: steamID, relationship: relationship });
    if (relationship === SteamUser.EClanRelationship.Invited) {
        const join = groups.indexOf(steamID.getSteamID64()) === -1;

        log.info('Got invited to group ' + steamID.getSteamID64() + ', ' + (join ? 'accepting...' : 'declining...'));
        client.respondToGroupInvite(steamID, groups.indexOf(steamID.getSteamID64()) === -1);
    } else if (relationship === SteamUser.EClanRelationship.Member) {
        log.info('Joined group ' + steamID.getSteamID64());
    }
};

exports.checkGroupInvites = function () {
    log.debug('Checking group invites', { groups: client.myGroups });
    for (const steamID in client.myGroups) {
        if (!Object.prototype.hasOwnProperty.call(client.myGroups, steamID)) {
            continue;
        }

        const relationship = client.myGroups[steamID];

        if (relationship === SteamUser.EClanRelationship.Invited) {
            client.respondToGroupInvite(steamID, false);
        }
    }

    groups.forEach(function (steamID) {
        if (client.myGroups[steamID] !== SteamUser.EClanRelationship.Member && client.myGroups[steamID] !== SteamUser.EClanRelationship.Blocked) {
            community.getSteamGroup(new SteamID(steamID), function (err, group) {
                if (err) {
                    log.warn('Failed to get group: ', err);
                    return;
                }

                log.info('Not member of group "' + group.name + ' ("' + steamID + '"), joining...');
                group.join(function (err) {
                    if (err) {
                        log.warn('Failed to join group: ', err);
                    }
                });
            });
        }
    });
};
