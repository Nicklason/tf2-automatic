const winston = require('winston');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../automatic.log');
const TRADE_PATH = path.join(__dirname, '../trade.log');
const ERROR_PATH = path.join(__dirname, '../automatic.error.log');

const levels = {
    debug: 5,
    verbose: 4,
    info: 3,
    warn: 2,
    trade: 1,
    error: 0
};

const colors = {
    debug: 'blue',
    verbose: 'cyan',
    info: 'green',
    warn: 'yellow',
    trade: 'magenta',
    error: 'red'
};

winston.addColors(colors);

const levelFilter = function (level) {
    return winston.format((info, opts) => {
        if (info.level !== level) {
            return false;
        }
        return info;
    });
};

const privateFilter = winston.format((info, opts) => {
    if (info.private === true) {
        return false;
    }

    return info;
});

const fileTransportFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const consoleTransportFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.errors({ stack: true }),
    winston.format.simple()
);

const debugEnabled = process.env.DEBUG === 'true';

const level = debugEnabled ? 'debug' : 'verbose';

const logger = winston.createLogger({
    levels: levels
});

// TODO: Populate transports through some sort of config / env variable

const transports = [{
    type: 'File',
    filename: LOG_PATH, level: level,
    filter: 'private'
}, {
    type: 'File',
    filename: TRADE_PATH, level: 'trade',
    filter: 'trade'
}, {
    type: 'File',
    filename: ERROR_PATH, level: 'error'
}, {
    type: 'Console',
    level: level
}];

transports.forEach(function (transport) {
    const type = transport.type;

    delete transport.type;

    if (type === 'File') {
        transport.format = fileTransportFormat;
    } else if (type === 'Console') {
        transport.format = consoleTransportFormat;
    }

    const filter = transport.filter;

    if (filter) {
        delete transport.filter;

        if (filter === 'trade') {
            transport.format = winston.format.combine(levelFilter(filter)(), transport.format);
        } else if (filter === 'private') {
            transport.format = winston.format.combine(privateFilter(), transport.format);
        }
    }

    logger.add(new winston.transports[type](transport));
});

module.exports = logger;
