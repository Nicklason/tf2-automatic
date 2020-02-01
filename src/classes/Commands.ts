import SteamID from 'steamid';
import SKU from 'tf2-sku';
import pluralize from 'pluralize';
import moment from 'moment';
import Currencies from 'tf2-currencies';

import Bot from './Bot';
import CommandParser from './CommandParser';
import { Entry } from './Pricelist';

import { Item } from '../types/TeamFortress2';
import { UnknownDictionaryKnownValues } from '../types/common';
import { fixItem } from '../lib/items';

export = class Commands {
    private readonly bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

    processMessage(steamID: SteamID, message: string): void {
        const command = CommandParser.getCommand(message);

        if (command === 'help') {
            this.helpCommand(steamID);
        } else if (command === 'how2trade') {
            this.howToTradeCommand(steamID);
        } else if (command === 'price') {
            this.priceCommand(steamID, message);
        } else if (command === 'stock') {
            this.stockCommand(steamID);
        } else if (command === 'rate') {
            this.rateCommand(steamID);
        } else {
            this.bot.sendMessage(steamID, 'I don\'t know what you mean, please type "!help" for all my commands!');
        }
    }

    private helpCommand(steamID: SteamID): void {
        const commands = [
            '!help - Get list of commands',
            '!how2trade - Guide on how to trade with the bot',
            '!price [amount] <name> - Get the price and stock of an item',
            '!stock - Get a list of items that the bot has',
            '!rate - Get current key prices'
        ];

        const reply = "Here's a list of all my commands:\n- " + commands.join('\n- ');

        this.bot.sendMessage(steamID, reply);
    }

    private howToTradeCommand(steamID: SteamID): void {
        this.bot.sendMessage(
            steamID,
            'You can either send me an offer yourself, or use one of my commands to request a trade. Say you want to buy a Team Captain, just type "!buy The Team Captain".'
        );
    }

    private priceCommand(steamID: SteamID, message: string): void {
        const info = this.getItemAndAmount(steamID, CommandParser.removeCommand(message));

        if (info === null) {
            return;
        }

        const isAdmin = this.bot.isAdmin(steamID);

        const match = info.match;
        const amount = info.amount;

        let reply = '';

        const isBuying = match.intent === 0 || match.intent === 2;
        const isSelling = match.intent === 1 || match.intent === 2;

        const keyPrice = this.bot.pricelist.getKeyPrice();

        const isKey = match.sku === '5021;6';

        if (isBuying) {
            reply = 'I am buying ';

            if (amount !== 1) {
                reply += amount + ' ';
            } else {
                reply += 'a ';
            }

            // If the amount is 1, then don't convert to value and then to currencies. If it is for keys, then don't use conversion rate
            const currencies =
                amount === 1
                    ? match.buy
                    : Currencies.toCurrencies(
                          match.buy.toValue(keyPrice.metal) * amount,
                          isKey ? undefined : keyPrice.metal
                      );

            reply += pluralize(match.name, amount) + ' for ' + currencies.toString();
        }

        if (isSelling) {
            const currencies =
                amount === 1
                    ? match.sell
                    : Currencies.toCurrencies(
                          match.sell.toValue(keyPrice.metal) * amount,
                          isKey ? undefined : keyPrice.metal
                      );

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

        reply += '. I have ' + this.bot.inventoryManager.getInventory().getAmount(match.sku);

        if (match.max !== -1 && isBuying) {
            reply += ' / ' + match.max;
        }

        if (isSelling && match.min !== 0) {
            reply += ' and I can sell ' + this.bot.inventoryManager.amountCanTrade(match.sku, false);
        }

        if (match.autoprice && isAdmin) {
            reply += ' (price last updated ' + moment.unix(match.time).fromNow() + ')';
        }

        reply += '.';

        this.bot.sendMessage(steamID, reply);
    }

    private stockCommand(steamID: SteamID): void {
        const dict = this.bot.inventoryManager.getInventory().getItems();

        const items = [];

        for (const sku in dict) {
            if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
                continue;
            }

            if (['5021;6', '5002;6', '5001;6', '5000;6'].includes(sku)) {
                continue;
            }

            items.push({
                name: this.bot.schema.getName(SKU.fromString(sku)),
                amount: dict[sku].length
            });
        }

        items.sort(function(a, b) {
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

        const pure = [
            {
                name: 'Mann Co. Supply Crate Key',
                amount: this.bot.inventoryManager.getInventory().getAmount('5021;6')
            },
            {
                name: 'Refined Metal',
                amount: this.bot.inventoryManager.getInventory().getAmount('5002;6')
            },
            {
                name: 'Reclaimed Metal',
                amount: this.bot.inventoryManager.getInventory().getAmount('5001;6')
            },
            {
                name: 'Scrap Metal',
                amount: this.bot.inventoryManager.getInventory().getAmount('5000;6')
            }
        ];

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

        let reply = "Here's a list of all the items that I have in my inventory:\n" + stock.join(', \n');
        if (left > 0) {
            reply += ',\nand ' + left + ' other ' + pluralize('item', left);
        }

        this.bot.sendMessage(steamID, reply);
    }

    private rateCommand(steamID: SteamID): void {
        const keyPrice = this.bot.pricelist.getKeyPrice().toString();

        this.bot.sendMessage(
            steamID,
            'I value Mann Co. Supply Crate Keys at ' +
                keyPrice +
                '. This means that one key is the same as ' +
                keyPrice +
                ', and ' +
                keyPrice +
                ' is the same as one key.'
        );
    }

    private getItemAndAmount(steamID: SteamID, message: string): { match: Entry; amount: number } | null {
        let name = message;
        let amount = 1;

        if (/^[-]?\d+$/.test(name.split(' ')[0])) {
            // Check if the first part of the name is a number, if so, then that is the amount the user wants to trade
            amount = parseInt(name.split(' ')[0]);
            name = name.replace(amount.toString(), '').trim();
        }

        if (1 > amount) {
            amount = 1;
        }

        if (!name) {
            this.bot.sendMessage(steamID, 'You forgot to add a name. Here\'s an example: "!price Team Captain"');
            return null;
        }

        let match = this.bot.pricelist.searchByName(name);
        if (match === null) {
            this.bot.sendMessage(
                steamID,
                'I could not find any items in my pricelist that contains "' +
                    name +
                    '", I might not be trading the item you are looking for.'
            );
            return null;
        } else if (Array.isArray(match)) {
            const matchCount = match.length;
            if (match.length > 20) {
                match = match.splice(0, 20);
            }

            let reply =
                "I've found " + match.length + ' items. Try with one of the items shown below:\n' + match.join(',\n');
            if (matchCount > match.length) {
                const other = matchCount - match.length;
                reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
            }

            this.bot.sendMessage(steamID, reply);
            return null;
        }

        return {
            amount: amount,
            match: match
        };
    }

    private getItemFromParams(steamID: SteamID | string, params: UnknownDictionaryKnownValues): Item {
        const item = SKU.fromString('');

        delete item.paint;
        delete item.craftnumber;

        let foundSomething = false;

        if (params.name !== undefined) {
            foundSomething = true;
            // Look for all items that have the same name

            const match = [];

            for (let i = 0; i < this.bot.schema.raw.schema.items.length; i++) {
                const schemaItem = this.bot.schema.raw.schema.items[i];
                if (schemaItem.item_name === params.name) {
                    match.push(schemaItem);
                }
            }

            if (match.length === 0) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an item in the schema with the name "' + params.name + '"'
                );
                return null;
            } else if (match.length !== 1) {
                const matchCount = match.length;

                const parsed = match
                    .splice(0, 20)
                    .map(schemaItem => schemaItem.defindex + ' (' + schemaItem.name + ')');

                let reply =
                    "I've found " +
                    matchCount +
                    ' items with a matching name. Please use one of the defindexes below as "defindex":\n' +
                    parsed.join(',\n');
                if (matchCount > parsed.length) {
                    const other = matchCount - parsed.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                this.bot.sendMessage(steamID, reply);
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
                break;
            }
        }

        if (!foundSomething) {
            this.bot.sendMessage(steamID, 'Missing item properties');
            return null;
        }

        if (params.defindex !== undefined) {
            const schemaItem = this.bot.schema.getItemByDefindex(params.defindex as number);

            if (schemaItem === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an item in the schema with the defindex "' + params.defindex + '"'
                );
                return null;
            }

            if (item.quality === 0) {
                item.quality = schemaItem.item_quality;
            }
        }

        if (typeof params.quality !== undefined) {
            const quality = this.bot.schema.getQualityIdByName(params.quality as string);
            if (quality === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find a quality in the schema with the name "' + params.quality + '"'
                );
                return null;
            }

            item.quality = quality;
        }

        if (params.paintkit !== undefined) {
            const paintkit = this.bot.schema.getSkinIdByName(params.paintkit as string);
            if (paintkit === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find a skin in the schema with the name "' + item.paintkit + '"'
                );
                return null;
            }

            item.paintkit = paintkit;
        }

        if (params.effect !== undefined) {
            const effect = this.bot.schema.getEffectIdByName(params.effect as string);

            if (effect === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an unusual effect in the schema with the name "' + params.effect + '"'
                );
                return null;
            }

            item.effect = effect;
        }

        if (typeof params.output === 'number') {
            // User gave defindex

            const schemaItem = this.bot.schema.getItemByDefindex(params.output);

            if (schemaItem === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an item in the schema with the defindex "' + params.defindex + '"'
                );
                return null;
            }

            if (item.outputQuality === null) {
                item.quality = schemaItem.item_quality;
            }
        } else if (item.output !== undefined) {
            // Look for all items that have the same name

            const match = [];

            for (let i = 0; i < this.bot.schema.raw.schema.items.length; i++) {
                const schemaItem = this.bot.schema.raw.schema.items[i];
                if (schemaItem.item_name === params.name) {
                    match.push(schemaItem);
                }
            }

            if (match.length === 0) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an item in the schema with the name "' + params.name + '"'
                );
                return null;
            } else if (match.length !== 1) {
                const matchCount = match.length;

                const parsed = match
                    .splice(0, 20)
                    .map(schemaItem => schemaItem.defindex + ' (' + schemaItem.name + ')');

                let reply =
                    "I've found " +
                    matchCount +
                    ' items with a matching name. Please use one of the defindexes below as "output":\n' +
                    parsed.join(',\n');
                if (matchCount > parsed.length) {
                    const other = matchCount - parsed.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                this.bot.sendMessage(steamID, reply);
                return null;
            }

            item.output = match[0].defindex;

            if (item.outputQuality === null) {
                item.quality = match[0].item_quality;
            }
        }

        if (params.outputQuality !== undefined) {
            const quality = this.bot.schema.getQualityIdByName(params.outputQuality as string);

            if (quality === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find a quality in the schema with the name "' + params.outputQuality + '"'
                );
                return null;
            }

            item.outputQuality = quality;
        }

        return fixItem(item, this.bot.schema);
    }
};
