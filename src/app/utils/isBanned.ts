import { parallel } from 'async';
import request from '@nicklason/request-retry';

export = function (steamid64: string, callback: (err?: Error, isBanned?: boolean) => void): void {
    parallel({
        bptf: function (callback: (err?: Error, result?: boolean) => void) {
            isBptfBanned(steamid64, callback);
        },
        steamrep: function (callback: (err?: Error, result?: boolean) => void) {
            isSteamRepMarked(steamid64, callback);
        }
    }, function (err, result) {
        if (err) {
            return callback(err);
        }

        return callback(null, result.bptf || result.steamrep);
    });
};

function isBptfBanned (steamid64: string, callback: (err?: Error, isBanned?: boolean) => void): void {
    request({
        url: 'https://backpack.tf/api/users/info/v1',
        qs: {
            key: process.env.BPTF_API_KEY,
            steamids: steamid64
        },
        gzip: true,
        json: true
    }, function (err, response, body) {
        if (err) {
            return callback(err);
        }

        const user = body.users[steamid64];

        return callback(null, user.bans && user.bans.all);
    });
}

function isSteamRepMarked (steamid64: string, callback: (err?: Error, isBanned?: boolean) => void): void {
    request({
        url: 'http://steamrep.com/api/beta4/reputation/' + steamid64,
        qs: {
            json: 1
        },
        gzip: true,
        json: true
    }, function (err, response, body) {
        if (err) {
            return callback(err);
        }

        return callback(null, body.steamrep.reputation.summary.toLowerCase().indexOf('scammer') !== -1);
    });
}
