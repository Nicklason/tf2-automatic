//@ts-check

const async = require('async');
const request = require('@nicklason/request-retry');

module.exports = function (steamid64, callback) {
    async.parallel({
        bptf: function (callback) {
            isBptfBanned(steamid64, callback);
        },
        steamrep: function (callback) {
            isSteamRepMarked(steamid64, callback);
        }
    }, function (err, result) {
        if (err) {
            return callback(err);
        }

        return callback(null, result.bptf || result.steamrep);
    });
};

function isBptfBanned (steamid64, callback) {
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

function isSteamRepMarked (steamid64, callback) {
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
