const dotProp = require('dot-prop');
const pluralize = require('pluralize');
const moment = require('moment');

const prices = require('app/prices');
const client = require('lib/client');
const inventory = require('app/inventory');

const parseJSON = require('utils/parseJSON');
const isAdmin = require('utils/isAdmin');

function getCommand (string) {
    if (string.startsWith('!')) {
        const command = string.toLowerCase().split(' ')[0].substr(1);
        return command;
    } else {
        return null;
    }
}

function getParams (string) {
    const params = parseJSON('{"' + string.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');

    const parsed = {};

    if (params !== null) {
        for (const key in params) {
            if (!Object.prototype.hasOwnProperty.call(params, key)) {
                continue;
            }

            let value = params[key];

            if (/^\d+$/.test(value)) {
                value = parseInt(value);
            } else if (/^\d+(\.\d+)?$/.test(value)) {
                value = parseFloat(value);
            } else if (value === 'true') {
                value = true;
            } else if (value === 'false') {
                value = false;
            }

            dotProp.set(parsed, key.trim(), value);
        }
    }

    return parsed;
}

exports.handleMessage = function (steamID, message) {
    const admin = isAdmin(steamID);
    const command = getCommand(message);

    if (command === 'price') {
        const name = message.substring(command.length + 1).trim();
        if (!name) {
            client.chatMessage(steamID, 'You forgot to add a name. Here\'s an example: "!price Team Captain"');
            return;
        }

        let match = prices.searchByName(name);
        if (match === null) {
            client.chatMessage(steamID, 'I could not find any items in my pricelist that contains "' + name + '", I might not be trading the item you are looking for.');
            return;
        } else if (Array.isArray(match)) {
            const matchCount = match.length;
            if (match.length > 20) {
                match = match.splice(0, 20);
            }

            let reply = 'I\'ve found ' + match + ' items. Try with one of the items shown below:\n' + match.join(',\n');
            if (matchCount > match.length) {
                const other = matchCount - match.length;
                reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
            }

            client.chatMessage(reply);
            return;
        }

        let reply = '';

        const isBuying = match.intent === 0 || match.intent === 2;
        const isSelling = match.intent === 1 || match.intent === 2;

        if (isBuying) {
            reply = 'I am buying a ' + match.name + ' for ' + match.buy.toString();
        }

        if (isSelling) {
            if (reply === '') {
                reply = 'I am selling a ' + match.name + ' for ' + match.sell.toString();
            } else {
                reply += ' and selling for ' + match.sell.toString();
            }
        }

        reply += '. I have ' + inventory.getAmount(match.sku);

        if (match.max !== -1 && isBuying) {
            reply += ' / ' + match.max;
        }

        if (isSelling && match.min !== 0) {
            reply += ' and I can sell ' + inventory.amountCanTrade(match.sku, false);
        }

        if (match.autoprice && isAdmin(steamID)) {
            reply += ' (price last updated ' + moment.unix(match.time).fromNow() + ')';
        }

        reply += '.';
        client.chatMessage(steamID, reply);
    } else if (admin && command === 'get') {
        const params = getParams(message.substring(command.length + 1).trim());

        const match = prices.get(params.sku);

        if (match === null) {
            client.chatMessage(steamID, 'Could not find item "' + params.sku + '" in the pricelist');
        } else {
            client.chatMessage(steamID, '/code ' + JSON.stringify(match, null, 4));
        }
    } else if (admin && command === 'add') {
        const params = getParams(message.substring(command.length + 1).trim());
        delete params.item;

        if (params.enabled === undefined) {
            params.enabled = true;
        }
        if (params.autoprice === undefined) {
            params.autoprice = true;
        }
        if (params.max === undefined) {
            params.max = 1;
        }
        if (params.min === undefined) {
            params.min = 0;
        }
        if (params.intent === undefined) {
            params.intent = 2;
        }

        prices.add(params.sku, params, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to add the item to the pricelist: ' + err.message);
            } else {
                client.chatMessage(steamID, 'Added "' + entry.name + '".');
            }
        });
    } else if (admin && command === 'update') {
        const params = getParams(message.substring(command.length + 1).trim());
        delete params.item;

        prices.update(params.sku, params, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to update the item in the pricelist: ' + err.message);
            } else {
                client.chatMessage(steamID, 'Updated "' + entry.name + '".');
            }
        });
    } else if (admin && command === 'remove') {
        const params = getParams(message.substring(command.length + 1).trim());

        prices.remove(params.sku, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to remove the item from the pricelist: ' + err.message);
            } else {
                client.chatMessage(steamID, 'Removed "' + entry.name + '".');
            }
        });
    }
};
