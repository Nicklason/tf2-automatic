const fs = require('graceful-fs');

const CONFIG_FILENAME = 'config.json';
const ACCOUNTS_FILENAME = 'accounts.json';
const STOCKLIMIT_FILENAME = 'limits.json';
const defaultLimits = {
    "The Team Captain": 1,
    "Name Tag": 1,
    "Non-Craftable Tour of Duty Ticket": 1,
    "Mann Co. Supply Crate Key": -1,
    "Strange Frying Pan": 1,
    "Strange Australium Rocket Launcher": 0,
    "Professional Killstreak AWPer Hand": 1
};
const defaultConfig = {
    "pricesKey": "<your key to the pricing api>",
    "bptfKey": "<your api key for the bptf api>",
    "dateFormat": "DD-MM-YYYY HH:mm:ss",
    "acceptGifts": true,
    "acceptBanned": false,
    "acceptEscrow": false,
    "comment": {
        "buy": "I am buying your %name% for %price%. I have %stock%",
        "sell": "I am selling my %name% for %price%"
    },
    "stocklimit": 1,
    "logs": {
        "console": {
            "type": "Console",
            "level": "verbose",
            "colorize": true
        },
        "file": {
            "type": "File",
            "filename": "automatic.log",
            "level": "debug",
            "json": false
        },
        "trade": {
            "type": "File",
            "filename": "automatic.trade.log",
            "level": "trade",
            "json": false
        }
    },
    "owners": ["<steamid64s>"]
};

const defaultAccounts = {
    "<name>": {
        "password": "",
        "shared_secret": "",
        "identity_secret": "",
        "bptfToken": ""
    },
    "accountToUse": "<name>"
};

let config = {};
let accounts = {};
let limits = {};

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (e) {
        return e;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, "\t"));
}

function get(val, def) {
    if (val) {
        return config[val] || def;
    }

    return config;
}

exports.get = get;

exports.write = function (conf) {
    config = conf;
    saveJSON(CONFIG_FILENAME, config);
};

exports.init = function () {
    let msg = "";

    if (fs.existsSync(CONFIG_FILENAME)) {
        config = parseJSON(CONFIG_FILENAME);
        if (typeof config === 'string') {
            msg = "Cannot load " + CONFIG_FILENAME + ". " + config.toString() + ". Using default config.";
            config = defaultConfig;
        }
    } else {
        exports.write(defaultConfig);
        msg = "Config has been generated.";
    }

    if (fs.existsSync(ACCOUNTS_FILENAME)) {
        accounts = parseJSON(ACCOUNTS_FILENAME);
        if (typeof accounts === "string") {
            msg += " Cannot load " + ACCOUNTS_FILENAME + ". " + accounts.toString() + ". No saved account details are available.";
            accounts = {};
        }
    } else {
        saveJSON(ACCOUNTS_FILENAME, defaultAccounts);
        msg += " Initialized new account storage.";
    }

    if (fs.existsSync(STOCKLIMIT_FILENAME)) {
        limits = parseJSON(STOCKLIMIT_FILENAME);
        if (typeof limits === "string") {
            msg += " Cannot load " + STOCKLIMIT_FILENAME + ". " + limits.toString() + ". Using default limits.";
            limits = defaultLimits;
        }
    } else {
        saveJSON(STOCKLIMIT_FILENAME, defaultLimits);
        msg += " Created limits schema.";
    }

    return msg.trim();
};

function addLimit(name, limit) {
    limits[name] = limit;
    saveJSON(STOCKLIMIT_FILENAME, limits);
}

function removeLimit(name) {
    delete limits[name];
    saveJSON(STOCKLIMIT_FILENAME, limits);
}

function getLimit(name) {
    return limits[name] || config.stocklimit;
}

function getAccount(name) {
    if (name === undefined) {
        return accounts[lastAccount()];
    }

    return accounts[name];
}

function lastAccount() {
    return accounts.accountToUse || null;
}

function getDetails(name) {
    if (!name) {
        return null;
    }

    let account = getAccount(name);

    let details = {
        name: name,
        password: account.password,
        shared_secret: account.shared_secret,
        identity_secret: account.identity_secret
    };
    return details;
}

exports.getAccount = getAccount;
exports.lastAccount = lastAccount;
exports.getDetails = getDetails;
exports.getLimit = getLimit;
exports.addLimit = addLimit;
exports.removeLimit = removeLimit;