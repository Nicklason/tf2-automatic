import moment from 'moment';

import * as handlerManager from './handler-manager';

const maxLoginAttemptsWithinPeriod = 3;
const loginPeriodTime = 60 * 1000;

let loginAttempts = [];

export function setAttempts (attempts) {
    loginAttempts = attempts.sort((a, b) => a - b).map((attempt) => moment.unix(attempt));
};

export function wait () {
    const attemptsWithinPeriod = getWithinPeriod(loginPeriodTime);

    if (attemptsWithinPeriod.length >= maxLoginAttemptsWithinPeriod) {
        // Wait till we have made 0 attempts in the period

        const oldest = attemptsWithinPeriod[0];
        oldest.add(loginPeriodTime, 'milliseconds');

        return oldest.diff(moment(), 'milliseconds');
    }

    return 0;
};

export function newAttempt () {
    cleanup();

    loginAttempts.push(moment());

    const attempts = loginAttempts.map((attempt) => attempt.unix());

    handlerManager.getHandler().onLoginAttempts(attempts);
};

function getWithinPeriod (milliseconds) {
    return loginAttempts.filter((attempt) => moment().diff(attempt, 'milliseconds') < milliseconds);
}

function cleanup () {
    loginAttempts = loginAttempts.filter((attempt) => moment().diff(attempt, 'milliseconds') < loginPeriodTime);
}
