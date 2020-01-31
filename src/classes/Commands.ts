import SteamID from 'steamid';
import SKU from 'tf2-sku';
import pluralize from 'pluralize';

import Bot from './Bot';
import CommandParser from './CommandParser';

import { Item } from '../types/TeamFortress2';
import { UnknownDictionaryKnownValues } from '../types/common';
import { fixItem } from '../lib/items';

export = class Commands {
    private readonly bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

    processMessage(steamID: SteamID | string, message: string): void {
        const steamID64 = steamID.toString();

        const isAdmin = this.bot.isAdmin(steamID);

        const command = CommandParser.getCommand(message);

        if (command === 'help') {
            const commands = ['!help - Get list of commands'];

            const reply = "Here's a list of all my commands:\n- " + commands.join('\n- ');

            this.bot.sendMessage(steamID, reply);
        } else {
            this.bot.sendMessage(steamID, 'I don\'t know what you mean, please type "!help" for all my commands!');
        }
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
