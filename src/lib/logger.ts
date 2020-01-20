import winston from 'winston';
require('winston-daily-rotate-file');

import paths from '../app/resources/paths';

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

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.colorize(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
        let msg = `${info.timestamp} ${info.level}: ${info.message}`;

        // @ts-ignore
        const splat = info[Symbol.for('splat')];

        if (splat) {
            if (splat.length === 1) {
                msg += ` ${JSON.stringify(splat[0])}`;
            } else if (splat.length > 1) {
                // @ts-ignore
                msg += ` ${JSON.stringify(info[Symbol.for('splat')])}`;
            }
        }

        return msg;
    })
);

const debugConsole = process.env.DEBUG === 'true';
// Debug to file is enabled by default
const debugFile = process.env.DEBUG_FILE === undefined ? true : process.env.DEBUG_FILE === 'true';

const logger = winston.createLogger({
    levels: levels
});

// TODO: Populate transports through some sort of config / env variable

const transports = [{
    type: 'DailyRotateFile',
    filename: paths.logs.log,
    level: debugFile ? 'debug' : 'verbose',
    filter: 'private',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxFiles: '14d'
}, {
    type: 'File',
    filename: paths.logs.trade,
    level: 'trade',
    filter: 'trade'
}, {
    type: 'File',
    filename: paths.logs.error,
    level: 'error'
}, {
    type: 'Console',
    level: debugConsole ? 'debug' : 'verbose'
}];

transports.forEach(function (transport) {
    const type = transport.type;

    delete transport.type;

    if (type === 'File' || type === 'DailyRotateFile') {
        transport.format = fileFormat;
    } else if (type === 'Console') {
        transport.format = consoleFormat;
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

    logger.add(new (winston.transports[type])(transport));
});

export default logger;
