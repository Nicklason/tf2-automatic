const SteamUser = require('steam-user');

const package = require('@root/package.json');

exports.onRun = require('handler/init');
exports.onShutdown = require('handler/shutdown');

// TODO: when the bot starts then request the pricelist and update all our prices

// TODO: update prices using socket

// TODO: get price of item from item object, like item.getSKU()

exports.onReady = function () {
    this.setPersona(SteamUser.EPersonaState.Online);
    this.gamesPlayed(package.name);
};

exports.onMessage = require('handler/commands').handleMessage;

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
}, {
    event: 'onPricelist',
    json: true
}].forEach(function (v) {
    exports[v.event] = function (data) {
        require('handler/save')(v, data);
    };
});
