const dotProp = require('dot-prop');
const pluralize = require('pluralize');
const moment = require('moment');
const SKU = require('tf2-sku');
const Currencies = require('tf2-currencies');
const validUrl = require('valid-url');

const prices = require('app/prices');
const client = require('lib/client');
const inventory = require('app/inventory');
const schemaManager = require('lib/tf2-schema');
const log = require('lib/logger');
const friends = require('handler/friends');
const trades = require('handler/trades');
const queue = require('handler/queue');
const handlerManager = require('app/handler-manager');
const api = require('lib/ptf-api');
const validator = require('lib/validator');
const manager = require('lib/manager');
const community = require('lib/community');

const parseJSON = require('utils/parseJSON');
const admin = require('app/admins');
const fixItem = require('utils/item/fixItem');

let messages = [];

setInterval(function () {
    messages = [];
}, 1000);

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

            if (key !== 'sku') {
                if (/^\d+$/.test(value)) {
                    value = parseInt(value);
                } else if (/^\d+(\.\d+)?$/.test(value)) {
                    value = parseFloat(value);
                } else if (value === 'true') {
                    value = true;
                } else if (value === 'false') {
                    value = false;
                }
            }

            dotProp.set(parsed, key.trim(), value);
        }
    }

    return parsed;
}

function getItemFromParams (steamID, params) {
    const item = SKU.fromString('');

    delete item.paint;
    delete item.craftnumber;

    let foundSomething = false;

    if (params.name !== undefined) {
        foundSomething = true;
        // Look for all items that have the same name

        const match = [];

        for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
            const schemaItem = schemaManager.schema.raw.schema.items[i];
            if (schemaItem.item_name === params.name) {
                match.push(schemaItem);
            }
        }

        if (match.length === 0) {
            client.chatMessage(steamID, 'Could not find an item in the schema with the name "' + params.name + '"');
            return null;
        } else if (match.length !== 1) {
            const matchCount = match.length;

            const parsed = match.splice(0, 20).map((schemaItem) => schemaItem.defindex + ' (' + schemaItem.name + ')');

            let reply = 'I\'ve found ' + matchCount + ' items with a matching name. Please use one of the defindexes below as "defindex":\n' + parsed.join(',\n');
            if (matchCount > parsed.length) {
                const other = matchCount - parsed.length;
                reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
            }

            client.chatMessage(steamID, reply);
            return null;
        }

        item.defindex = match[0].defindex;
        item.quality = match[0].item_quality;
    }

    for (const key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
            continue;
        }

        if (item[key] !== undefined) {
            foundSomething = true;
            item[key] = params[key];
            delete params[key];
        }
    }

    if (!foundSomething) {
        client.chatMessage(steamID, 'Missing item properties');
        return null;
    }

    if (item.defindex !== 0) {
        const schemaItem = schemaManager.schema.getItemByDefindex(item.defindex);

        if (schemaItem === null) {
            client.chatMessage(steamID, 'Could not find an item in the schema with the defindex "' + item.defindex + '"');
            return null;
        }

        if (item.quality === 0) {
            item.quality = schemaItem.item_quality;
        }
    }

    if (typeof item.quality !== 'number') {
        const quality = schemaManager.schema.getQualityIdByName(item.quality);
        if (quality === null) {
            client.chatMessage(steamID, 'Could not find a quality in the schema with the name "' + item.quality + '"');
            return null;
        }

        item.quality = quality;
    }

    if (item.paintkit !== null) {
        const paintkit = schemaManager.schema.getSkinByName(item.paintkit);
        if (paintkit === null) {
            client.chatMessage(steamID, 'Could not find a skin in the schema with the name "' + item.paintkit + '"');
            return null;
        }

        item.paintkit = paintkit;
    }

    if (item.effect !== null) {
        const effect = schemaManager.schema.getEffectByName(item.effect);

        if (effect === null) {
            client.chatMessage(steamID, 'Could not find an unusual effect in the schema with the name "' + item.paintkit + '"');
            return null;
        }

        item.effect = effect;
    }

    if (typeof item.output === 'number') {
        // User gave defindex

        const schemaItem = schemaManager.schema.getItemByDefindex(item.output);

        if (schemaItem === null) {
            client.chatMessage(steamID, 'Could not find an item in the schema with the defindex "' + item.defindex + '"');
            return null;
        }

        if (item.quality === 0) {
            item.quality = schemaItem.item_quality;
        }
    } else if (item.output !== null) {
        // Look for all items that have the same name

        const match = [];

        for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
            const schemaItem = schemaManager.schema.raw.schema.items[i];
            if (schemaItem.item_name === params.name) {
                match.push(schemaItem);
            }
        }

        if (match.length === 0) {
            client.chatMessage(steamID, 'Could not find an item in the schema with the name "' + params.name + '"');
            return null;
        } else if (match.length !== 1) {
            const matchCount = match.length;

            const parsed = match.splice(0, 20).map((schemaItem) => schemaItem.defindex + ' (' + schemaItem.name + ')');

            let reply = 'I\'ve found ' + matchCount + ' items with a matching name. Please use one of the defindexes below as "output":\n' + parsed.join(',\n');
            if (matchCount > parsed.length) {
                const other = matchCount - parsed.length;
                reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
            }

            client.chatMessage(steamID, reply);
            return null;
        }

        item.output = match[0].defindex;

        if (item.outputQuality === null) {
            item.quality = match[0].item_quality;
        }
    }

    if (item.outputQuality !== null) {
        const quality = schemaManager.schema.getQualityIdByName(item.outputQuality);

        if (quality === null) {
            client.chatMessage(steamID, 'Could not find a quality in the schema with the name "' + item.outputQuality + '"');
            return null;
        }

        item.outputQuality = quality;
    }

    return fixItem(item);
}

exports.handleMessage = function (steamID, message) {
    const steamID64 = steamID.getSteamID64();

    const isFriend = friends.isFriend(steamID64);

    if (!isFriend) {
        // Not friends with user
        return;
    }

    const friend = friends.getFriend(steamID);

    if (friend === null) {
        log.info('Message from ' + steamID64 + ': ' + message);
    } else {
        log.info('Message from ' + friend.player_name + ' (' + steamID64 + '): ' + message);
    }

    if (messages.indexOf(steamID64) !== -1) {
        return;
    }

    messages.push(steamID64);

    const isAdmin = admin.isAdmin(steamID64);
    const command = getCommand(message);

    if (command === 'help') {
        let reply = 'Here\'s a list of all my commands: !help, !how2trade, !rate, !price [amount] <name>, !stock, !buy [amount] <name>, !sell [amount] <name>';
        if (isAdmin) {
            reply += ', !get, !add, !remove, !update, !restart, !stop, !trades, !name, !avatar';
        }
        client.chatMessage(steamID, reply);
    } else if (command === 'how2trade') {
        client.chatMessage(steamID, 'Send me a trade offer with the items you want to buy / sell.');
    } else if (command === 'rate') {
        const keyPrice = prices.getKeyPrice();
        const keyPriceString = keyPrice.toString();

        client.chatMessage(steamID, 'I value Mann Co. Supply Crate Keys at ' + keyPriceString + '. This means that one key is the same as ' + keyPriceString + ', and ' + keyPriceString + ' is the same as one key.');
    } else if (command === 'price') {
        const info = getItemAndAmount(steamID, removeCommandFromMessage(message, command));

        if (info === null) {
            return;
        }

        const match = info.match;
        const amount = info.amount;

        let reply = '';

        const isBuying = match.intent === 0 || match.intent === 2;
        const isSelling = match.intent === 1 || match.intent === 2;

        const keyPrice = prices.getKeyPrice();

        const isKey = match.sku === '5021;6';

        if (isBuying) {
            reply = 'I am buying ';

            if (amount !== 1) {
                reply += amount + ' ';
            } else {
                reply += 'a ';
            }

            // If the amount is 1, then don't convert to value and then to currencies. If it is for keys, then don't use conversion rate
            const currencies = amount === 1 ? match.buy : Currencies.toCurrencies(match.buy.toValue(keyPrice.metal) * amount, isKey ? undefined : keyPrice.metal);

            reply += pluralize(match.name, amount) + ' for ' + currencies.toString();
        }

        if (isSelling) {
            const currencies = amount === 1 ? match.sell : Currencies.toCurrencies(match.sell.toValue(keyPrice.metal) * amount, isKey ? undefined : keyPrice.metal);

            if (reply === '') {
                reply = 'I am selling ';

                if (amount !== 1) {
                    reply += amount + ' ';
                } else {
                    reply += 'a ';
                }

                reply += pluralize(match.name, amount) + ' for ' + currencies.toString();
            } else {
                reply += ' and selling for ' + currencies.toString();
            }
        }

        reply += '. I have ' + inventory.getAmount(match.sku);

        if (match.max !== -1 && isBuying) {
            reply += ' / ' + match.max;
        }

        if (isSelling && match.min !== 0) {
            reply += ' and I can sell ' + inventory.amountCanTrade(match.sku, false);
        }

        if (match.autoprice && isAdmin) {
            reply += ' (price last updated ' + moment.unix(match.time).fromNow() + ')';
        }

        reply += '.';
        client.chatMessage(steamID, reply);
    } else if (command === 'stock') {
        const dict = inventory.getOwnInventory();

        const items = [];

        for (const sku in dict) {
            if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
                continue;
            }

            if (['5021;6', '5002;6', '5001;6', '5000;6'].indexOf(sku) !== -1) {
                continue;
            }

            items.push({
                name: schemaManager.schema.getName(SKU.fromString(sku)),
                amount: dict[sku].length
            });
        }

        items.sort(function (a, b) {
            if (a.amount === b.amount) {
                if (a.name < b.name) {
                    return -1;
                } else if (a.name > b.name) {
                    return 1;
                } else {
                    return 0;
                }
            }
            return b.amount - a.amount;
        });

        const pure = [{
            name: 'Mann Co. Supply Crate Key',
            amount: inventory.getAmount('5021;6')
        }, {
            name: 'Refined Metal',
            amount: inventory.getAmount('5002;6')
        }, {
            name: 'Reclaimed Metal',
            amount: inventory.getAmount('5001;6')
        }, {
            name: 'Scrap Metal',
            amount: inventory.getAmount('5000;6')
        }];

        const parsed = pure.concat(items);

        const stock = [];
        let left = 0;

        for (let i = 0; i < parsed.length; i++) {
            if (stock.length > 20) {
                left += parsed[i].amount;
            } else {
                stock.push(parsed[i].name + ': ' + parsed[i].amount);
            }
        }

        let reply = 'Here\'s a list of all the items that I have in my inventory:\n' + stock.join(', \n');
        if (left > 0) {
            reply += ',\nand ' + left + ' other ' + pluralize('item', left);
        }
        // reply += '\nYou can see my inventory and prices here: https://backpack.tf/profiles/' + client.steamID.getSteamID64();

        client.chatMessage(steamID, reply);
    } else if (command === 'buy' || command === 'sell') {
        const info = getItemAndAmount(steamID, removeCommandFromMessage(message, command));

        if (info === null) {
            return;
        }

        const buying = command === 'sell';

        const activeOfferID = trades.getActiveOffer(steamID);

        if (activeOfferID !== null) {
            client.chatMessage(steamID, 'You already have an active offer! Please finish it before requesting a new one:  https://steamcommunity.com/tradeoffer/' + activeOfferID + '/');
            return;
        }

        const position = queue.getPosition(steamID);

        if (position !== -1) {
            if (position === 0) {
                client.chatMessage(steamID, 'You are already in the queue! Please wait while I process your offer.');
            } else {
                client.chatMessage(steamID, 'You are already in the queue! Please wait your turn, there ' + (position !== 1 ? 'are' : 'is') + ' ' + position + ' infront of you.');
            }
            return;
        }

        const newPosition = queue.addRequestedTrade(steamID, info.match.sku, info.amount, buying);

        if (newPosition !== 0) {
            client.chatMessage(steamID, 'You have been added to the queue! Please wait your turn, there ' + (newPosition !== 1 ? 'are' : 'is') + ' ' + newPosition + ' infront of you.');
        }

        queue.handleQueue();
    } else if (isAdmin && command === 'get') {
        const params = getParams(removeCommandFromMessage(message, command));

        if (params.item !== undefined) {
            // Remove by full name
            let match = prices.searchByName(params.item, false);

            if (match === null) {
                client.chatMessage(steamID, 'I could not find any items in my pricelist that contains "' + params.item + '"');
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply = 'I\'ve found ' + match.length + ' items. Try with one of the items shown below:\n' + match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                client.chatMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(fixItem(item));
        }

        if (params.sku === undefined) {
            client.chatMessage(steamID, 'Missing item');
            return;
        }

        const match = prices.get(params.sku);

        if (match === null) {
            client.chatMessage(steamID, 'Could not find item "' + params.sku + '" in the pricelist');
        } else {
            client.chatMessage(steamID, '/code ' + JSON.stringify(match, null, 4));
        }
    } else if (isAdmin && command === 'add') {
        const params = getParams(removeCommandFromMessage(message, command));

        if (params.enabled === undefined) {
            params.enabled = true;
        }
        if (params.max === undefined) {
            params.max = 1;
        }
        if (params.min === undefined) {
            params.min = 0;
        }
        if (params.intent === undefined) {
            params.intent = 2;
        } else if (typeof params.intent === 'string') {
            const intent = ['buy', 'sell', 'bank'].indexOf(params.intent.toLowerCase());
            if (intent !== -1) {
                params.intent = intent;
            }
        }

        if (typeof params.buy === 'object') {
            params.buy.keys = params.buy.keys || 0;
            params.buy.metal = params.buy.metal || 0;

            if (params.autoprice === undefined) {
                params.autoprice = false;
            }
        }
        if (typeof params.sell === 'object') {
            params.sell.keys = params.sell.keys || 0;
            params.sell.metal = params.sell.metal || 0;

            if (params.autoprice === undefined) {
                params.autoprice = false;
            }
        }

        if (params.autoprice === undefined) {
            params.autoprice = true;
        }

        if (params.sku === undefined) {
            const item = getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        params.sku = SKU.fromObject(fixItem(SKU.fromString(params.sku)));

        prices.add(params.sku, params, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to add the item to the pricelist: ' + (err.body && err.body.message ? err.body.message : err.message));
            } else {
                client.chatMessage(steamID, 'Added "' + entry.name + '".');
            }
        });
    } else if (isAdmin && command === 'update') {
        const params = getParams(removeCommandFromMessage(message, command));

        if (typeof params.intent === 'string') {
            const intent = ['buy', 'sell', 'bank'].indexOf(params.intent.toLowerCase());
            if (intent !== -1) {
                params.intent = intent;
            }
        }

        if (params.all === true) {
            // TODO: Must have atleast one other param
            client.chatMessage(steamID, 'Updating pricelist...');

            const pricelist = prices.getPricelist();

            if (pricelist.length === 0) {
                client.chatMessage(steamID, 'Your pricelist is empty');
                return;
            }

            handlerManager.getHandler().cleanup();

            for (let i = 0; i < pricelist.length; i++) {
                if (params.intent) {
                    pricelist[i].intent = params.intent;
                }

                if (params.min && typeof params.min === 'number') {
                    pricelist[i].min = params.min;
                }

                if (params.max && typeof params.max === 'number') {
                    pricelist[i].max = params.max;
                }

                if (params.enabled === false || params.enabled === true) {
                    pricelist[i].enabled = params.enabled;
                }

                if (params.autoprice === false) {
                    pricelist[i].time = null;
                    pricelist[i].autoprice = false;
                } else if (params.autoprice === true) {
                    pricelist[i].time = 0;
                    pricelist[i].autoprice = true;
                }

                if (i === 0) {
                    const errors = validator({
                        sku: pricelist[i].sku,
                        enabled: pricelist[i].enabled,
                        intent: pricelist[i].intent,
                        max: pricelist[i].max,
                        min: pricelist[i].min,
                        autoprice: pricelist[i].autoprice,
                        name: pricelist[i].name,
                        buy: pricelist[i].buy.toJSON(),
                        sell: pricelist[i].sell.toJSON(),
                        time: pricelist[i].time
                    }, 'pricelist');

                    if (errors !== null) {
                        throw new Error(errors.join(', '));
                    }
                }
            }

            // Save pricelist
            handlerManager.getHandler().onPricelist(pricelist);
            // Kill it
            handlerManager.getHandler().shutdown();
            return;
        }

        if (typeof params.buy === 'object') {
            params.buy.keys = params.buy.keys || 0;
            params.buy.metal = params.buy.metal || 0;

            if (params.autoprice === undefined) {
                params.autoprice = false;
            }
        }
        if (typeof params.sell === 'object') {
            params.sell.keys = params.sell.keys || 0;
            params.sell.metal = params.sell.metal || 0;

            if (params.autoprice === undefined) {
                params.autoprice = false;
            }
        }

        if (params.item !== undefined) {
            // Remove by full name
            let match = prices.searchByName(params.item, false);

            if (match === null) {
                client.chatMessage(steamID, 'I could not find any items in my pricelist that contains "' + params.item + '"');
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply = 'I\'ve found ' + match.length + ' items. Try with one of the items shown below:\n' + match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                client.chatMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        prices.update(params.sku, params, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to update the item in the pricelist: ' + (err.body && err.body.message ? err.body.message : err.message));
            } else {
                client.chatMessage(steamID, 'Updated "' + entry.name + '".');
            }
        });
    } else if (isAdmin && command === 'remove') {
        const params = getParams(removeCommandFromMessage(message, command));

        if (params.item !== undefined) {
            // Remove by full name
            let match = prices.searchByName(params.item, false);

            if (match === null) {
                client.chatMessage(steamID, 'I could not find any items in my pricelist that contains "' + params.item + '"');
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply = 'I\'ve found ' + match.length + ' items. Try with one of the items shown below:\n' + match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                client.chatMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        prices.remove(params.sku, function (err, entry) {
            if (err) {
                client.chatMessage(steamID, 'Failed to remove the item from the pricelist: ' + err.message);
            } else {
                client.chatMessage(steamID, 'Removed "' + entry.name + '".');
            }
        });
    } else if (isAdmin && command === 'trades') {
        const dateNow = new Date().getTime();
        const offerData = manager.pollData.offerData;

        let tradeToday = 0;
        let tradeTotal = 0;
        for (const offerID in offerData) {
            if (!Object.prototype.hasOwnProperty.call(offerData, offerID)) {
                continue;
            }

            if (offerData[offerID].handledByUs === true && offerData[offerID].isAccepted === true) {
                // Sucessful trades handled by the bot
                tradeTotal++;

                if (offerData[offerID].finishTimestamp >= (dateNow - 86400000)) {
                    // Within the last 24 hours
                    tradeToday++;
                }
            }
        }

        client.chatMessage(steamID, 'Trades today: ' + tradeToday + ' \n Total trades: ' + tradeTotal);
    } else if (isAdmin && command === 'restart') {
        client.chatMessage(steamID, 'Restarting...');

        handlerManager.getHandler().restart(function (err, restarting) {
            if (err) {
                log.warn('Error occurred while trying to restart: ', err);
                client.chatMessage(steamID, 'An error occurred while trying to restart: ' + err.message);
                return;
            }

            if (!restarting) {
                client.chatMessage(steamID, 'You are not running the bot with PM2! See the documentation: https://github.com/Nicklason/tf2-automatic/wiki/PM2');
            }
        });
    } else if (isAdmin && command === 'stop') {
        client.chatMessage(steamID, 'Stopping...');

        handlerManager.getHandler().stop(function (err, stopping) {
            if (err) {
                log.warn('Error occurred while trying to stop: ', err);
                client.chatMessage(steamID, 'An error occurred while trying to stop: ' + err.message);
                return;
            }

            if (!stopping) {
                client.chatMessage(steamID, 'You are not running the bot with PM2! See the documentation: https://github.com/Nicklason/tf2-automatic/wiki/PM2');
            }
        });
    } else if (isAdmin && command === 'pricecheck') {
        const params = getParams(removeCommandFromMessage(message, command));

        if (params.sku === undefined) {
            const item = getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        params.sku = SKU.fromObject(fixItem(SKU.fromString(params.sku)));

        api.requestCheck(params.sku, 'bptf', function (err) {
            if (err) {
                client.chatMessage(steamID, 'Error while requesting price check: ' + (err.body && err.body.message ? err.body.message : err.message));
                return;
            }
            client.chatMessage(steamID, 'Price check has been requested, the item will be checked.');
        });
    } else if (isAdmin && command === 'name') {
        // This has already been used but since I'm planning on rewriting this for user extensions it will remain.
        const newName = removeCommandFromMessage(message, command);

        if (newName === '') {
            client.chatMessage(steamID, 'You forgot to add a name. Example: "!name Nicklason"');
            return;
        }

        community.editProfile({
            name: newName
        }, function (err) {
            if (err) {
                log.warn('Error while changing name: ', err);
                client.chatMessage(steamID, 'Error while changing name: ' + err.message);

                return;
            }

            client.chatMessage(steamID, 'Successfully changed name.');
        });
    } else if (isAdmin && command === 'avatar') {
        const imageUrl = removeCommandFromMessage(message, command);

        if (imageUrl === '') {
            client.chatMessage(steamID, 'You forgot to add an image url. Example: "!avatar https://steamuserimages-a.akamaihd.net/ugc/949595415286366323/8FECE47652C9D77501035833E937584E30D0F5E7/"');
            return;
        }

        if (!validUrl.isUri(imageUrl)) {
            client.chatMessage(steamID, 'Your url is not valid. Example: "!avatar https://steamuserimages-a.akamaihd.net/ugc/949595415286366323/8FECE47652C9D77501035833E937584E30D0F5E7/"');
            return;
        }

        community.uploadAvatar(imageUrl, (err) => {
            if (err) {
                log.warn('Error while uploading new avatar: ', err);
                client.chatMessage(steamID, 'Error while uploading new avatar: ' + err.message);

                return;
            }

            client.chatMessage(steamID, 'Successfully uploaded new avatar.');
        });
    } else {
        client.chatMessage(steamID, 'I don\'t know what you mean, please type "!help" for all my commands!');
    }
};

function getItemAndAmount (steamID, message) {
    let name = message;
    let amount = 1;

    if (/^[-]?\d+$/.test(name.split(' ')[0])) {
        // Check if the first part of the name is a number, if so, then that is the amount the user wants to trade
        amount = parseInt(name.split(' ')[0]);
        name = name.replace(amount, '').trim();
    }

    if (1 > amount) {
        amount = 1;
    }

    if (!name) {
        client.chatMessage(steamID, 'You forgot to add a name. Here\'s an example: "!price Team Captain"');
        return null;
    }

    let match = prices.searchByName(name);
    if (match === null) {
        client.chatMessage(steamID, 'I could not find any items in my pricelist that contains "' + name + '", I might not be trading the item you are looking for.');
        return null;
    } else if (Array.isArray(match)) {
        const matchCount = match.length;
        if (match.length > 20) {
            match = match.splice(0, 20);
        }

        let reply = 'I\'ve found ' + match.length + ' items. Try with one of the items shown below:\n' + match.join(',\n');
        if (matchCount > match.length) {
            const other = matchCount - match.length;
            reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
        }

        client.chatMessage(steamID, reply);
        return null;
    }

    return {
        amount: amount,
        match: match
    };
}

function removeCommandFromMessage (message, command) {
    return message.substring(command.length + 1).trim();
}
