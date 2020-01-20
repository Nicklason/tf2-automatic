import SteamID from 'steamid';

import client from '../lib/client';

const admins = process.env.ADMINS === undefined ? [] : JSON.parse(process.env.ADMINS);

admins.forEach(function (steamid64) {
    if (!new SteamID(steamid64).isValid()) {
        throw new Error('Invalid admin SteamID64 "' + steamid64 + '"');
    }
});

export function message (message) {
    if (process.env.ALERTS === 'none') {
        return;
    }

    admins.forEach(function (steamID) {
        client.chatMessage(steamID, message);
    });
};

export function isAdmin (steamID) {
    const steamid64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();
    return admins.indexOf(steamid64) !== -1;
};

export function getAdmins () {
    return admins;
};
