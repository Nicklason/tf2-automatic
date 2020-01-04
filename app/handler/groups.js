const SteamUser = require('steam-user');
const SteamID = require('steamid');

const log = require('lib/logger');
const client = require('lib/client');
const community = require('lib/community');

const groupsToJoin = process.env.GROUPS === undefined ? [] : JSON.parse(process.env.GROUPS);

groupsToJoin.forEach(function (steamid64) {
    if (!new SteamID(steamid64).isValid()) {
        throw new Error('Invalid group SteamID64 "' + steamid64 + '"');
    }
});

exports.groupRelationChanged = function (steamID, relationship) {
    log.debug('Group relation changed', { steamID: steamID, relationship: relationship });
    if (relationship === SteamUser.EClanRelationship.Invited) {
        const join = groupsToJoin.indexOf(steamID.getSteamID64()) === -1;

        log.info('Got invited to group ' + steamID.getSteamID64() + ', ' + (join ? 'accepting...' : 'declining...'));
        client.respondToGroupInvite(steamID, groupsToJoin.indexOf(steamID.getSteamID64()) === -1);
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

    groupsToJoin.forEach(function (steamID) {
        if (client.myGroups[steamID] !== SteamUser.EClanRelationship.Member && client.myGroups[steamID] !== SteamUser.EClanRelationship.Blocked) {
            community.getSteamGroup(new SteamID(steamID), function (err, group) {
                if (err) {
                    log.warn('Failed to get group: ', err);
                    return;
                }

                log.info('Not member of group "' + group.name + '", joining...');
                group.join(function (err) {
                    if (err) {
                        log.warn('Failed to join group: ', err);
                    }
                });
            });
        }
    });
};
