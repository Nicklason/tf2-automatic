let SteamUser;
let SteamCommunity;
let TradeOfferManager;
let Winston;

try {
    SteamUser = require('steam-user');
    SteamCommunity = require('steamcommunity');
    TradeOfferManager = require('steam-tradeoffer-manager');
    Winston = require('winston');
} catch (ex) {
    console.error("Missing dependencies. Install a version with dependencies or use npm install.");
    process.exit(1);
}

const version = require('../package.json').version || "unknown";

const utils = require('./utils.js');

const config = require('./config.js');
const logging = require('./logging.js');
const client = require('./client.js');
const backpack = require('./backpacktf.js');
const items = require('./items.js');
const prices = require('./prices.js');
const inventory = require('./inventory.js');
const offer = require('./offer.js');
const confirmations = require('./confirmations.js');

// Get message from initializing the config.
const configlog = config.init();

let Automatic = {
    version: version,
    inventory: [],
    getOwnSteamID() {
        return Automatic.client.steamID ? Automatic.client.steamID.getSteamID64() : null;
    },
    isOwner(steamid64) {
        return config.get().owners.includes(steamid64);
    }
};

Automatic.config = config;
Automatic.client = new SteamUser({ "promptSteamGuardCode": false });
Automatic.community = new SteamCommunity();
Automatic.manager = new TradeOfferManager({
    "steam": Automatic.client,
    "language": "en",
    "pollInterval": 2000,
    "cancelTime": 5 * 60 * 1000,
    "pendingCancelTime": 1 * 60 * 1000
});

let log = Automatic.log = new Winston.Logger({
    "levels": logging.LOG_LEVELS,
    "colors": logging.LOG_COLORS
});

// These should be accessable from (almost) everywhere.
Automatic.items = items;
Automatic.backpack = backpack;
Automatic.prices = prices;
Automatic.inventory = inventory;

function register(...args) {
    args.forEach(function(component) {
        if (typeof component === 'string') {
            component = require('./' + component);
        }
        component.register(Automatic);
    });
}

register(
    logging,
    items,
    backpack,
    prices,
    inventory,
    client,
    offer,
    confirmations
);

if (configlog) {
    utils.fatal(log, "Config messages: " + configlog);
}

log.info("tf2-automatic v%s starting", version);

process.nextTick(client.connect);

utils.request.get({
    url: "https://raw.githubusercontent.com/Nicklason/tf2-automatic/master/package.json",
    json: true
}, function(err, body) {
    if (err) {
        log.warn("Cannot check for updates: " + err.message);
    } else {
        const current = version.split('.');
        const latest = body.version.split('.');

        const curv = current[0] * 100 + current[1] * 10 + current[2];
        const latestv = latest[0] * 100 + latest[1] * 10 + latest[2];
        if (latestv > curv) {
            log.info("============================================================");
            log.info("Update available! Current: v%s, Latest: v%s", version, body.version);
            log.info("Download it here: https://github.com/Nicklason/tf2-automatic");
            log.info("============================================================");
        }
    }
});

process.on('uncaughtException', (err) => {
    log.error([
        "tf2-automatic crashed! Please create an issue with the following log:",
        `crash: Automatic.version: ${Automatic.version}; node: ${process.version} ${process.platform} ${process.arch}; Contact: ${Automatic.getOwnSteamID()}`,
        `crash: Stack trace::`,
        require('util').inspect(err)
    ].join('\r\n'));
    process.exit(1);
});