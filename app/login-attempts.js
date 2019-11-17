const moment = require('moment');

const handlerManager = require('app/handler-manager');

let loginAttempts = [];

exports.setAttempts = function (attempts) {
    loginAttempts = attempts.sort((a, b) => a - b).map((attempt) => moment.unix(attempt));
};

exports.wait = function () {
    const period = 1 * 60;

    const attemptsWithinPeriod = getWithinPeriod(period);

    if (attemptsWithinPeriod.length >= 5) {
        // Wait till we have made 0 attempts in the period

        const oldest = attemptsWithinPeriod[0];
        oldest.add(period, 'seconds');

        return oldest.diff(moment(), 'milliseconds');
    }

    return 0;
};

exports.newAttempt = function () {
    cleanup();

    loginAttempts.push(moment());

    const attempts = loginAttempts.map((attempt) => attempt.unix());

    handlerManager.getHandler().onLoginAttempts(attempts);
};

function getWithinPeriod (seconds) {
    return loginAttempts.filter((attempt) => moment().diff(attempt, 'seconds') < seconds);
}

function cleanup () {
    loginAttempts = loginAttempts.filter((attempt) => moment().diff(attempt, 'hours') < 24);
}
