const SteamUser = require('steam-user');
const async = require('async');

const utils = require('./utils.js');
const Login = require('./login.js');
const Messages = require('./messages.js');

let Automatic, client, log, config, Items, Backpack, Prices, Inventory, Trade;

let started = false;

exports.register = function(automatic) {
    Automatic = automatic;
    client = automatic.client;
    community = automatic.community;
    manager = automatic.manager;
    log = automatic.log;
    config = automatic.config;

    Items = automatic.items;
    Backpack = automatic.backpack;
    Prices = automatic.prices;
    Inventory = automatic.inventory;
    Friends = automatic.friends;
    Trade = automatic.trade;

    Login.register(automatic);
    Messages.register(automatic);

    client.on('webSession', saveCookies);
    community.on('sessionExpired', sessionExpired);
    community.on('confKeyNeeded', confKeyNeeded);
};

exports.connect = function () {
    const account = config.getAccount();

    if (account.name != '' && account.password != '' && account.shared_secret != '' && account.identity_secret != '') {
        log.info("Connecting to Steam...");
        Login.performLogin(account, handleLogin);
    } else {
        utils.fatal(log, "No account found / missing details, please add an account and try again.");
    }
};

function handleLogin(err) {
    if (err) {
        utils.fatal(log, "Failed to sign in: " + err.message + ".");
        return;
    }

    client.on('loggedOn', function() {
        log.info('Logged onto Steam!');
        // This should fix the bot going offline, yet it is still running.
        if (started) {
            client.gamesPlayed([require('../package.json').name, 440]);
            client.setPersona(SteamUser.EPersonaState.Online);
        }
    });
}

function saveCookies(sessionID, cookies) {
    log.debug('Setting cookies...');
    community.setCookies(cookies);

    manager.setCookies(cookies, function(err) {
        if (err) {
            utils.fatal(log, "This account is limited, you can't use it for trading.");
        }

        // Don't want to initialize all the packages if we already have started before.
        // I am not sure, but the webSession event should be emitted when refreshing the session (calling client.webLogOn), meaning that this will be called again.
        if (!started) {
            started = true;
            initializePackages();
        }
    });
}


function initializePackages(callback) {
    async.series([
        function (callback) {
            Items.init(callback);
        },
        function (callback) {
            Inventory.init(callback);
        },
        function (callback) {
            Backpack.init(callback);
        },
        function (callback) {
            Prices.init(callback);
        }
    ], ready);
}

function ready(err) {
    if (err) {
        utils.fatal(log, "An error occurred while initializing the packages: " + err.message + ".");
    }

    log.debug('Modules are ready!');

    log.info(`tf2-automatic is ready; ${Prices.list().length} ${utils.plural('item', Prices.list().length)} in the pricelist, ${Backpack.listings().length} ${utils.plural('listing', Backpack.listings().length)} on www.backpack.tf (limit: ${Backpack.cap()})`);
    client.gamesPlayed([require('../package.json').name, 440]);
    client.setPersona(SteamUser.EPersonaState.Online);
    Messages.init();
    Friends.init();
    Trade.init();
}

function sessionExpired(err) {
    log.debug('Session has expired, refreshing the session.');
    client.webLogOn();
}

function confKeyNeeded(tag, callback) {
    log.debug('New confirmation key needed, generating new one.');
    var time = Math.floor(Date.now() / 1000);
    callback(null, time, SteamTotp.getConfirmationKey(self.options.identity_secret, time, tag));
}