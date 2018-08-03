const fs = require('graceful-fs');
const moment = require('moment');

const utils = require('./utils.js');

let log, Prices;

const FOLDER_NAME = 'temp';
const HISTORY_FILENAME = FOLDER_NAME + '/history.json';

let HISTORY = {}, WAIT;

exports.register = function (automatic) {
    Prices = automatic.prices;
    log = automatic.log;

    if (fs.existsSync(HISTORY_FILENAME)) {
        const data = utils.parseJSON(fs.readFileSync(HISTORY_FILENAME));
        if (data != null) {
            HISTORY = data;
        }
    }
};

exports.addItem = addItem;
exports.profit = getProfit;
exports.potentialProfit = getPotentialProfit;

function addItem(name, assetid, value, intent) {
    let history = HISTORY[assetid] || { name: name };

    intent = intent == 0 ? 'bought' : 'sold';
    history[intent] = value; // Considering that the price of keys can change, we need to use the current value of the item
    history['time_' + intent] = moment().unix();

    HISTORY[assetid] = history;

    saveHistory();
}

function getProfit(today = false) {
    // if hours is = Infinity, then get all profit
    let total = 0;

    const current = moment().unix();
    const max = today ? utils.secondsToday() : Infinity; // Convert hours to seconds

    for (let assetid in HISTORY) {
        const history = HISTORY[assetid];
        if (!history.bought || !history.sold) {
            continue;
        }
        const good = max >= current - history.time_sold ;
        if (good) {
            total += history.sold - history.bought;
        }
    }

    return total;
}

function getPotentialProfit() {
    let total = 0;

    for (let assetid in HISTORY) {
        const history = HISTORY[assetid];
        // Checking if it has the name property because it previously didn't have that.
        if (!history.bought || history.sold || !history.name) {
            continue;
        }

        let price = Prices.getPrice(history.name);
        if (price != null && price.price != null && price.price.hasOwnProperty('sell')) {
            price = Prices.value(price.price.sell);
            total += price - history.bought;
        }
    }

    return total;
}

function saveHistory() {
    clearTimeout(WAIT);
    
    WAIT = setTimeout(function () {
        fs.writeFile(HISTORY_FILENAME, JSON.stringify(HISTORY, null, '\t'), function (err) {
            if (err) {
                log.warn('Error writing history data: ' + err);
                return;
            }
        });
    }, 2000);
}
