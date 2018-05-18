const fs = require('graceful-fs');

const FOLDER_NAME = 'temp';
const CONFIG_FILENAME = FOLDER_NAME + '/config.json';
const ACCOUNT_FILENAME = FOLDER_NAME + '/account.json';
const STOCKLIMIT_FILENAME = FOLDER_NAME + '/limits.json';
const DEFAULT_CONFIG = {
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
    'group': '',
    'stocklimit': 1,
    'notify': 'trade', // "all" / "none" / "price" / "trade"
    'offerMessage': '',
    //'metalSupply': 200, This is not being used, but will be in the future
    'overstockOverpay': 0.05,
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
            'json': false,
            'maxsize': 5242880,
            'maxFiles': 10
        },
        'trade': {
            'type': 'File',
            'filename': 'automatic.trade.log',
            'level': 'trade',
            'json': false,
            'maxsize': 5242880,
            'maxFiles': 3
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

let CONFIG = {};
let ACCOUNT = {};
let LIMITS = {};

let WAIT;

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (e) {
        return e;
    }
}

function saveJSON(file, data, wait = false) {
    if (wait == false) {
        fs.writeFileSync(file, JSON.stringify(data, null, '\t'));
        return;
    }

    clearTimeout(WAIT);

    WAIT = setTimeout(function () {
        saveJSON(file, data);
    }, 1000);
}

function get(val, def) {
    if (val) {
        return CONFIG[val] || def || DEFAULT_CONFIG[val];
    }

    return CONFIG;
}

function getDefault(val) {
    if (val) {
        return DEFAULT_CONFIG[val];
    }

    return DEFAULT_CONFIG;
}

exports.get = get;
exports.default = getDefault;

exports.write = function (conf) {
    CONFIG = conf;
    saveJSON(CONFIG_FILENAME, CONFIG);
};

exports.init = function () {
    let msg = '';
    if (!fs.existsSync(FOLDER_NAME)) {
        fs.mkdir(FOLDER_NAME);
        msg += 'Created temp folder. ';
    }

    if (fs.existsSync(CONFIG_FILENAME)) {
        CONFIG = parseJSON(CONFIG_FILENAME);
        if (typeof CONFIG === 'string') {
            msg += 'Cannot load ' + CONFIG_FILENAME + '. ' + CONFIG.toString() + '. Using default config. ';
            CONFIG = DEFAULT_CONFIG;
        }
    } else {
        exports.write(DEFAULT_CONFIG);
        msg += 'Config has been generated. ';
    }

    if (fs.existsSync(ACCOUNT_FILENAME)) {
        ACCOUNT = parseJSON(ACCOUNT_FILENAME);
        if (typeof ACCOUNT === 'string') {
            msg += 'Cannot load ' + ACCOUNT_FILENAME + '. ' + ACCOUNT.toString() + '. No saved account details are available. ';
            ACCOUNT = {};
        }
    } else {
        saveJSON(ACCOUNT_FILENAME, defaultAccount);
        msg += 'Initialized new account storage. ';
    }

    if (fs.existsSync(STOCKLIMIT_FILENAME)) {
        LIMITS = parseJSON(STOCKLIMIT_FILENAME);
        if (typeof LIMITS === 'string') {
            msg += 'Cannot load ' + STOCKLIMIT_FILENAME + '. ' + LIMITS.toString() + '. ';
        }
    }

    return msg.trim();
};

function addLimit(name, limit) {
    LIMITS[name] = limit;
    saveJSON(STOCKLIMIT_FILENAME, LIMITS);
}

function removeLimit(name) {
    if (LIMITS.hasOwnProperty(name)) {
        delete LIMITS[name];
        saveJSON(STOCKLIMIT_FILENAME, LIMITS, true);
    }
}

function getLimit(name) {
    let limit = LIMITS[name] || CONFIG.stocklimit;
    if (limit == -1) {
        limit = Infinity;
    } else if (limit < -1) {
        limit = CONFIG.stocklimit;
    }
    return limit;
}

function getAccount() {
    return ACCOUNT;
}

exports.getAccount = getAccount;
exports.limit = getLimit;
exports.addLimit = addLimit;
exports.removeLimit = removeLimit;
