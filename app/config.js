const fs = require('graceful-fs');

const FOLDER_NAME = 'temp';
const CONFIG_FILENAME = FOLDER_NAME + '/config.json';
const ACCOUNT_FILENAME = FOLDER_NAME + '/account.json';
const DEFAULT_CONFIG = {
    'client_id': '<your client id>',
    'client_secret': '<your client secret>',
    'bptfKey': '<your api key for the bptf api>',
    'dateFormat': 'DD-MM-YYYY HH:mm:ss',
    'acceptGifts': true,
    'acceptBanned': false,
    'acceptEscrow': false,
    'comment': {
        'buy': 'I am buying your %name% for %price%, I have %current_stock% / %max_stock%.',
        'sell': 'I am selling my %name% for %price%, I have %current_stock%.'
    },
    'groups': ['103582791462300957'], // groupid64, this is the tf2automatic steam group
    'stocklimit': 1,
    'notify': 'trade', // "all" / "none" / "price" / "trade"
    'offerMessage': '',
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
        if (CONFIG[val] != undefined) {
            return CONFIG[val];
        } else if (def != undefined) {
            return def;
        } else {
            return DEFAULT_CONFIG[val];
        }
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
    let msgs = [];
    if (!fs.existsSync(FOLDER_NAME)) {
        fs.mkdirSync(FOLDER_NAME);
        msgs.push('created temp folder');
    }

    if (fs.existsSync(CONFIG_FILENAME)) {
        CONFIG = parseJSON(CONFIG_FILENAME);
        if (typeof CONFIG === 'string') {
            msgs.push('can\'t load ' + CONFIG_FILENAME + ' ' + CONFIG.toString() + ' (using default)');
            CONFIG = DEFAULT_CONFIG;
        }
    } else {
        exports.write(DEFAULT_CONFIG);
        msgs.push('created config file');
    }

    if (fs.existsSync(ACCOUNT_FILENAME)) {
        ACCOUNT = parseJSON(ACCOUNT_FILENAME);
        if (typeof ACCOUNT === 'string') {
            msgs.push('can\'t load ' + ACCOUNT_FILENAME + ' ' + ACCOUNT.toString());
            ACCOUNT = {};
        }
    } else {
        saveJSON(ACCOUNT_FILENAME, defaultAccount);
        msgs.push('created account file');
    }

    return msgs.join(', ');
};

function getAccount() {
    return ACCOUNT;
}

exports.getAccount = getAccount;