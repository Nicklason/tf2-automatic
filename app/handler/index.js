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

[{
    event: 'onLoginKey',
    json: false
}, {
    event: 'onLoginAttempts',
    json: true
}, {
    event: 'onPollData',
    json: true
}, {
    event: 'onActions',
    json: true
}].forEach(function (v) {
    exports[v.event] = function (data) {
        require('handler/save')(v, data);
    };
});
