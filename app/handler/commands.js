const dotProp = require('dot-prop');
const SKU = require('tf2-sku');

const prices = require('app/prices');
const client = require('lib/client');
const schemaManager = require('lib/tf2-schema');

const parseJSON = require('utils/parseJSON');
const isAdmin = require('utils/isAdmin');
const fixItem = require('utils/item/fixItem');

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

        const item = SKU.fromString('');
        item.name = null;

        let foundMatch = false;

        // Go through parsed object
        for (const key in parsed) {
            if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(item, key)) {
                foundMatch = true;
                item[key] = parsed[key];
                delete parsed[key];
            }
        }

        if (foundMatch) {
            if (item.name !== null) {
                // Get defindex from name if name is supplied
                const schemaItem = schemaManager.schema.getItemByItemName(item.name);
                if (schemaItem !== null) {
                    item.defindex = schemaItem.defindex;
                }
            }

            if (item.quality !== null) {
                const quality = schemaManager.schema.getQualityIdByName(item.quality);
                if (quality !== null) {
                    item.quality = quality;
                }
            }

            if (item.paintkit !== null) {
                const paintkit = schemaManager.schema.getSkinByName(item.paintkit);
                if (paintkit !== null) {
                    item.paintkit = paintkit;
                }
            }

            if (item.effect !== null) {
                const effect = schemaManager.schema.getEffectByName(item.effect);
                if (effect !== null) {
                    item.effect = effect;
                }
            }

            if (item.output !== null) {
                const schemaItem = schemaManager.schema.getItemByItemName(item.output);
                if (schemaItem !== null) {
                    item.output = schemaItem.defindex;
                }
            }

            if (item.outputQuality !== null) {
                const quality = schemaManager.schema.getQualityIdByName(item.outputQuality);
                if (quality !== null) {
                    item.outputQuality = quality;
                }
            }

            if (item.defindex !== 0 && item.quality === 0) {
                // Default quality to 6
                item.quality = 6;
            }
        }

        parsed.item = fixItem(foundMatch ? item : SKU.fromString(parsed.sku));

        delete parsed.item.paint;
        delete parsed.item.craftnumber;

        parsed.sku = SKU.fromObject(parsed.item);
        parsed.name = schemaManager.schema.getName(parsed.item);
    }

    return parsed;
}

exports.handleMessage = function (steamID, message) {
    const admin = isAdmin(steamID);
    const command = getCommand(message);

    if (admin && command === 'get') {
        const params = getParams(message.substring(command.length + 1).trim());

        const match = prices.get(params.sku);

        if (match === null) {
            client.chatMessage(steamID, 'Could not find item "' + params.name + '" in the pricelist');
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
