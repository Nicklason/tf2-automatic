const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const async = require('async');

const utils = require('./utils.js');
const Login = require('./login.js');
const Messages = require('./messages.js');

let Automatic, client, community, manager, log, config, Items, tf2, Backpack, Prices, Inventory, Friends, Trade, Screenshot;

let started = false;

exports.register = function(automatic) {
    Automatic = automatic;
    client = automatic.client;
    community = automatic.community;
    manager = automatic.manager;
    log = automatic.log;
    config = automatic.config;

    Items = automatic.items;
    tf2 = automatic.tf2;
    Backpack = automatic.backpack;
    Prices = automatic.prices;
    Inventory = automatic.inventory;
    Friends = automatic.friends;
    Trade = automatic.trade;
    Screenshot = automatic.screenshot;

    Login.register(automatic);
    Messages.register(automatic);

    client.on('webSession', saveCookies);
    client.on('error', clientError);
    community.on('sessionExpired', sessionExpired);
    community.on('confKeyNeeded', confKeyNeeded);

    tf2.on('craftingComplete', craftingComplete);
};

exports.connect = function (ratelimit) {
    const account = config.getAccount();

    if (account.name != '' && account.password != '' && account.shared_secret != '' && account.identity_secret != '') {
        if (ratelimit) {
            log.warn('Your account has received a login cooldown. Wait half an hour before retrying, otherwise it resets to 30 minutes again. Retrying in an hour...');
            setTimeout(function() {
                Login.performLogin(account, handleLogin);
            }, 60 * 60 * 1000);
            return;
        }
        log.info('Connecting to Steam...');
        Login.performLogin(account, handleLogin);
    } else {
        utils.fatal(log, 'No account found / missing details, please add an account and try again.');
    }
};

function handleLogin(err) {
    if (err) {
        utils.fatal(log, 'Failed to sign in: ' + err.message + '.');
        return;
    }

    client.on('loggedOn', function() {
        log.info('Logged onto Steam!');
        if (started) {
            client.gamesPlayed([require('../package.json').name, 440]);
            client.setPersona(SteamUser.EPersonaState.Online);
        }
    });
}

function saveCookies(sessionID, cookies) {
    log.debug('Setting cookies...');
    community.setCookies(cookies);
    Screenshot.setCookies(cookies);

    manager.setCookies(cookies, function (err) {
        if (err) {
            utils.fatal(log, 'This account is limited, you can\'t use it for trading.');
        }

        if (!started) {
            started = true;
            initializePackages();
            community.profileSettings({
                inventory: SteamCommunity.PrivacyState.Public,
                gameDetails: SteamCommunity.PrivacyState.Public
            });
        }
    });
}

function ready(err) {
    if (err) {
        utils.fatal(log, 'An error occurred while initializing the packages: ' + err.message + '.');
    }

    log.debug('Modules are ready!');

    Automatic.running = true;

    log.info(`tf2-automatic is ready; ${Prices.list().length} ${utils.plural('item', Prices.list().length)} in the pricelist, ${Backpack.listings().length} ${utils.plural('listing', Backpack.listings().length)} on www.backpack.tf (limit: ${Backpack.cap()})`);
    client.gamesPlayed([require('../package.json').name, 440]);
    client.setPersona(SteamUser.EPersonaState.Online);

    log.debug('Sorting inventory');
    tf2.sortBackpack(3);
    
    Messages.init();
    Friends.init();
    Trade.init();
    Backpack.startUpdater();

    joinGroups();
}

function joinGroups() {
    const groups = config.get('groups');

    const relations = client.myGroups;
    for (let i = 0; i < groups.length; i++) {
        const id = groups[i];

        let relation = SteamUser.EClanRelationship.None;
        for (let group in relations) {
            if (id != group) {
                continue;
            }

            relation = relations[group];
        }

        if (relation != SteamUser.EClanRelationship.Member) {
            joinGroup(id);
        }
    }

    // todo: leave groups that are not in the list 
}

function joinGroup(id) {
    community.joinGroup(id, function(err) {
        if (err) {
            log.warn('An error occurred while joining a group: ' + err.message);
            log.debug(err.stack);
            return;
        }
    });
}

function clientError(err) {
    if (err.message == 'RateLimitExceeded') {
        exports.connect(true);
        return;
    }

    log.warn('An error occurred with the client: ' + err.message);
    log.debug(err.stack);
}

function sessionExpired() {
    log.debug('Session has expired, refreshing it.');
    Automatic.refreshSession();
}

function confKeyNeeded(tag, callback) {
    log.debug('New confirmation key needed, generating one.');
    var time = Math.floor(Date.now() / 1000);
    callback(null, time, SteamTotp.getConfirmationKey(self.options.identity_secret, time, tag));
}

function craftingComplete(recipe, itemsGained) {
    log.debug('Crafting complete, gained ' + itemsGained.length + ' ' + utils.plural('item', itemsGained.lenght) + ' (recipe ' + recipe + ')');
}

function initializePackages() {
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