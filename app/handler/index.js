const SteamUser = require('steam-user');

const package = require('@root/package.json');

exports.onRun = require('handler/init');
exports.onShutdown = require('handler/shutdown');

exports.onReady = function () {
    this.setPersona(SteamUser.EPersonaState.Online);
    this.gamesPlayed(package.name);
};

exports.onTF2QueueCompleted = function () {
    this.gamesPlayed(package.name);
};

exports.onNewTradeOffer = function (done) {
    done('decline');
};

// TODO: Use objects and pair events with files

const saveEventData = require('handler/save');
['onLoginKey', 'onLoginAttempts', 'onPollData'].forEach(function (v) {
    exports[v] = saveEventData[v];
});
