const Winston = require('winston');
const moment = require('moment');

const LOG_LEVELS = {
    debug: 5,
    verbose: 4,
    info: 3,
    warn: 2,
    error: 1,
    trade: 0
};

const LOG_COLORS = {
    debug: 'blue',
    verbose: 'cyan',
    info: 'green',
    warn: 'yellow',
    error: 'red',
    trade: 'magenta'
};

exports.LOG_LEVELS = LOG_LEVELS;
exports.LOG_COLORS = LOG_COLORS;

let logger;
let config;

exports.register = function (Automatic) {
    logger = Automatic.log;
    config = Automatic.config.get();

    createTransports();
};

function createTransports () {
    for (let name in config.logs) {
        if (!config.logs.hasOwnProperty(name)) {
            continue;
        }

        let transport = config.logs[name];
        let type = transport.type;

        delete transport.type;
        transport.name = name;
        transport.timestamp = getTimestamp;

        logger.add(Winston.transports[type], transport);
    }
}

function getTimestamp () {
    return moment().format(config.dateFormat || 'HH:mm:ss');
}
