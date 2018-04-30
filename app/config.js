const fs = require('graceful-fs');

const FOLDER_NAME = 'temp';
const CONFIG_FILENAME = FOLDER_NAME + '/config.json';
const ACCOUNT_FILENAME = FOLDER_NAME + '/account.json';
const STOCKLIMIT_FILENAME = FOLDER_NAME + '/limits.json';
const defaultConfig = {
    'pricesKey': '<your key to the pricing api>',
    'bptfKey': '<your api key for the bptf api>',
    'dateFormat': 'DD-MM-YYYY HH:mm:ss',
    'acceptGifts': true,
    'acceptBanned': false,
    'acceptEscrow': false,
    'comment': {
        'buy': 'I am buying your %name% for %price%. I have %stock%',
        'sell': 'I am selling my %name% for %price%'
    },
    'stocklimit': 1,
    'notify': 'trade', // "all" / "none" / "price" / "trade"
    'offerMessage': '',
    'logs': {
        'console': {
            'type': 'Console',
            'level': 'verbose',
            'colorize': true
        },
        'file': {
            'type': 'File',
            'filename': 'automatic.log',
            'level': 'debug',
            'json': false
        },
        'trade': {
            'type': 'File',
            'filename': 'automatic.trade.log',
            'level': 'trade',
            'json': false
        }
    },
    'owners': ['<steamid64s>']
};

const defaultAccount = {
        'name': '',
        'password': '',
        'shared_secret': '',
        'identity_secret': '',
        'bptfToken': ''
};

let config = {};
let account = {};
let limits = {};

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (e) {
        return e;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, '\t'));
}

function get(val, def) {
    if (val) {
        return config[val] || def || defaultConfig[val];
    }

    return config;
}

exports.get = get;

exports.write = function (conf) {
    config = conf;
    saveJSON(CONFIG_FILENAME, config);
};

exports.init = function () {
    let msg = '';
    if (!fs.existsSync(FOLDER_NAME)) {
        fs.mkdir(FOLDER_NAME);
        msg += 'Created temp folder. ';
    }

    if (fs.existsSync(CONFIG_FILENAME)) {
        config = parseJSON(CONFIG_FILENAME);
        if (typeof config === 'string') {
            msg += 'Cannot load ' + CONFIG_FILENAME + '. ' + config.toString() + '. Using default config. ';
            config = defaultConfig;
        }
    } else {
        exports.write(defaultConfig);
        msg += 'Config has been generated. ';
    }

    if (fs.existsSync(ACCOUNT_FILENAME)) {
        account = parseJSON(ACCOUNT_FILENAME);
        if (typeof account === 'string') {
            msg += 'Cannot load ' + ACCOUNT_FILENAME + '. ' + account.toString() + '. No saved account details are available. ';
            account = {};
        }
    } else {
        saveJSON(ACCOUNT_FILENAME, defaultAccount);
        msg += 'Initialized new account storage. ';
    }

    if (fs.existsSync(STOCKLIMIT_FILENAME)) {
        limits = parseJSON(STOCKLIMIT_FILENAME);
        if (typeof limits === 'string') {
            msg += 'Cannot load ' + STOCKLIMIT_FILENAME + '. ' + limits.toString() + '. ';
        }
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

function getAccount() {
    return account;
}

exports.getAccount = getAccount;
exports.limit = getLimit;
exports.addLimit = addLimit;
exports.removeLimit = removeLimit;