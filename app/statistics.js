const fs = require('graceful-fs');

const utils = require('./utils.js');

let log;

const FOLDER_NAME = 'temp';
const HISTORY_FILENAME = FOLDER_NAME + '/history.json';

let HISTORY = {}, WAIT;

exports.register = function (automatic) {
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

function addItem(name, assetid, value, intent) {
    let history = HISTORY[assetid] || { name: name };

    intent = intent == 0 ? 'bought' : 'sold';
    history[intent] = value; // Considering that the price of keys can change, we need to use the current value of the item
    history['time_' + intent] = utils.epoch();

    HISTORY[assetid] = history;

    saveHistory();
}

function getProfit(today = false) {
    // if hours is = Infinity, then get all profit
    let total = 0;

    const current = utils.epoch();
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

function saveHistory() {
    clearTimeout(WAIT);
    
    WAIT = setTimeout(function () {
        fs.writeFile(HISTORY_FILENAME, JSON.stringify(HISTORY, null, '\t'), function (err) {
            if (err) {
                log.warn('Error writing history data: ' + err);
                return;
            }
        });
    }, 10000);
}
