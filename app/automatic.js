/* eslint no-console: off*/

global._mckay_statistics_opt_out = true;

let SteamUser;
let SteamCommunity;
let TradeOfferManager;
let TeamFortress2;
let Winston;
let execSync;
let spawn;
let readline;
let fs;
let path;
let pm2;

try {
    SteamUser = require('steam-user');
    SteamCommunity = require('steamcommunity');
    TradeOfferManager = require('steam-tradeoffer-manager');
    TeamFortress2 = require('tf2');
    Winston = require('winston');
    execSync = require('child_process').execSync;
    spawn = require('child_process').spawn;
    readline = require('readline');
    fs = require('graceful-fs');
    path = require('path');
    pm2 = require('pm2');
} catch (ex) {
    console.log(ex);
    console.error('Missing dependencies. Install a version with dependencies or use npm install.');
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', function (line) {
    if (line === 'update') {
        Automatic.updateRepo(true);
    }
});

const version = require('../package.json').version || 'unknown';

const utils = require('./utils.js');

const config = require('./config.js');
const logging = require('./logging.js');
const client = require('./client.js');
const backpack = require('./backpacktf.js');
const items = require('./items.js');
const prices = require('./prices.js');
const inventory = require('./inventory.js');
const friends = require('./friends.js');
const screenshot = require('./screenshot.js');
const offer = require('./offer.js');
const trade = require('./trade.js');
const statistics = require('./statistics.js');
const confirmations = require('./confirmations.js');
const pm = process.env.pm_id;

// Get message from initializing the config.
const configlog = config.init();

let recentlyRefreshedSession = false;

let Automatic = {
    running: false,
    version: version,
    inventory: [],
    getOwnSteamID () {
        return Automatic.client.steamID ? Automatic.client.steamID.getSteamID64() : null;
    },
    isOwner (steamID64) {
        return config.get('owners').includes(steamID64);
    },
    alert (type, message) {
        const notify = config.get('notify', 'none');
        if (notify == 'all' || notify == type) {
            const owners = config.get('owners');
            if (owners.length == 1 && owners[0] == '<steamid64s>') {
                return;
            }
            owners.forEach(function (owner) {
                Automatic.message(owner, message);
            });
        }
    },
    message (steamID64, message) {
        Automatic.friends.getDetails(steamID64, function (err, details) {
            log.info('Message sent to ' + (err ? steamID64 : details.personaname + ' (' + steamID64 + ')') + ': ' + message);
            Automatic.client.chatMessage(steamID64, message);
        });
    },
    refreshSession () {
        log.debug('Refreshing session...');
        if (!recentlyRefreshedSession) {
            log.debug('We havn\'t refreshed the session recently, continuing');
            recentlyRefreshedSession = true;

            Automatic.client.webLogOn();
            setTimeout(function () {
                log.debug('Session refresh timeout stopped');
                recentlyRefreshedSession = false;
            }, 5 * 60 * 1000);
        }
    },
    expired () {
        log.warn('API Access has expired, shutting down...');
        Automatic.backpack.stop(function () {
            Automatic.client.gamesPlayed([]);
            Automatic.client.setPersona(SteamUser.EPersonaState.Snooze);
            Automatic.running = false;
        });
    },
    updateRepo (promptConfirm = false) {
        if (fs.existsSync(path.resolve(__dirname, '../.git'))) {
            if (!pm) {
                if (promptConfirm) {
                    log.info('It looks like you have cloned this from GitHub, do you want to pull the changes? [y/n]');
                    rl.question('', function (answer) {
                        if (answer.toLowerCase() === 'y') {
                            log.info('Attempting to update the repository...');
                            execSync('npm run update', { stdio: [0, 1, 2] });
                            process.exit();
                        }
                    });
                } else {
                    log.info('Attempting to update the repository...');
                    execSync('npm run update', { stdio: [0, 1, 2] });
                    process.exit();
                }
            } else {
                log.info('Attempting to update the repository...');
                const subprocess = spawn('git', ['pull'], {
                    detached: true,
                    stdio: 'ignore'
                });

                subprocess.unref();
                pm2.connect(function (err) {
                    if (err) {
                        log.error(err);
                        process.exit(1);
                    }
                    pm2.restart(pm, function (err) {
                        if (err) {
                            log.error(err);
                            process.exit(1);
                        }
                    });
                });
                process.exit();
            }
        }
    }
};

Automatic.config = config;
Automatic.client = new SteamUser({ promptSteamGuardCode: false });
Automatic.community = new SteamCommunity();
Automatic.manager = new TradeOfferManager({
    steam: Automatic.client,
    language: 'en',
    pollInterval: 2000,
    cancelTime: 5 * 60 * 1000,
    pendingCancelTime: 1 * 60 * 1000
});

let log = Automatic.log = new Winston.Logger({
    levels: logging.LOG_LEVELS,
    colors: logging.LOG_COLORS
});

// These should be accessable from (almost) everywhere.
Automatic.items = items;
Automatic.backpack = backpack;
Automatic.prices = prices;
Automatic.inventory = inventory;
Automatic.friends = friends;
Automatic.trade = trade;
Automatic.statistics = statistics;
Automatic.screenshot = screenshot;
Automatic.tf2 = new TeamFortress2(Automatic.client);

function register (...args) {
    args.forEach(function (component) {
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
    trade,
    client,
    friends,
    statistics,
    screenshot,
    offer,
    confirmations
);

if (configlog) {
    utils.fatal(log, 'Config messages: ' + configlog);
}

log.info('tf2-automatic v%s starting', version);

process.nextTick(client.connect);

function checkUpdates (notify = true) {
    utils.request.get({
        url: 'https://raw.githubusercontent.com/Nicklason/tf2-automatic/master/package.json',
        json: true
    }, function (err, body) {
        if (err) {
            log.warn('Cannot check for updates: ' + err.message);
        } else {
            const current = version.split('.');
            const latest = body.version.split('.');

            const curv = current[0] * 100 + current[1] * 10 + current[2];
            const latestv = latest[0] * 100 + latest[1] * 10 + latest[2];
            if (latestv > curv) {
                log.info('============================================================');
                log.info('Update available! Current: v%s, Latest: v%s', version, body.version);
                log.info('Download it here: https://github.com/Nicklason/tf2-automatic');
                log.info('============================================================');
                if (notify) {
                    config.get('owners').forEach(function (owner) {
                        Automatic.message(owner, 'Your bot is running outdated version, update it with !updateBot');
                    });
                } else {
                    Automatic.updateRepo(true);
                }
            }
        }
    });
}
checkUpdates(false);
setInterval(checkUpdates, 60 * 60 * 4 * 1000);

process.on('uncaughtException', function (err) {
    log.error([
        'tf2-automatic crashed! Please create an issue with the following log:',
        `crash: Automatic.version: ${Automatic.version}; node: ${process.version} ${process.platform} ${process.arch}; Contact: ${Automatic.getOwnSteamID()}`,
        'crash: Stack trace:',
        require('util').inspect(err)
    ].join('\r\n'));
    log.error('Create an issue here: https://github.com/Nicklason/tf2-automatic/issues/new');
    setTimeout(function () {
        process.exit(1);
    }, 10);
});
