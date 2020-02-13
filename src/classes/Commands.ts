import SteamID from 'steamid';
import SKU from 'tf2-sku';
import pluralize from 'pluralize';
import moment from 'moment';
import Currencies from 'tf2-currencies';

import Bot from './Bot';
import CommandParser from './CommandParser';
import { Entry, EntryData } from './Pricelist';
import Cart from './Cart';
import AdminCart from './AdminCart';
import UserCart from './UserCart';
import MyHandler from './MyHandler';
import CartQueue from './CartQueue';

import { Item } from '../types/TeamFortress2';
import { UnknownDictionaryKnownValues } from '../types/common';
import { fixItem } from '../lib/items';
import validator from '../lib/validator';
import log from '../lib/logger';

const COMMANDS: string[] = [
    '!help - Get list of commands',
    '!how2trade - Guide on how to use and trade with the bot',
    '!price [amount] <name> - Get the price and stock of an item',
    '!stock - Get a list of items that the bot has',
    '!rate - Get current key prices',
    '!buy [amount] <name> - Instantly buy an item',
    '!sell [amount] <sell> - Instantly sell an item',
    '!buycart [amount] <name> - Adds an item you want to buy to the cart',
    '!sellcart [amount] <name> - Adds an item you want to sell to the cart',
    '!cart - See current cart',
    '!clearcart - Clears the current cart',
    '!checkout - Make the bot send an offer the items in the cart'
];

const ADMIN_COMMANDS: string[] = [
    '!deposit - Used to deposit items',
    '!withdraw - Used to withdraw items',
    '!get - Get raw information about a pricelist entry',
    '!add - Add a pricelist entry',
    '!remove - Remove a pricelist entry',
    '!update - Update a pricelist entry',
    '!stop - Stop the bot',
    '!restart - Restart the bot'
];

export = class Commands {
    private readonly bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

    get cartQueue(): CartQueue {
        return (this.bot.getHandler() as MyHandler).cartQueue;
    }

    processMessage(steamID: SteamID, message: string): void {
        const command = CommandParser.getCommand(message);

        const isAdmin = this.bot.isAdmin(steamID);

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
        } else if (command === 'cart') {
            this.cartCommand(steamID);
        } else if (command === 'clearcart') {
            this.clearCartCommand(steamID);
        } else if (command === 'checkout') {
            this.checkoutCommand(steamID);
        } else if (command === 'deposit' && isAdmin) {
            this.depositCommand(steamID, message);
        } else if (command === 'withdraw' && isAdmin) {
            this.withdrawCommand(steamID, message);
        } else if (command === 'buycart') {
            this.buyCartCommand(steamID, message);
        } else if (command === 'sellcart') {
            this.sellCartCommand(steamID, message);
        } else if (command === 'buy') {
            this.buyCommand(steamID, message);
        } else if (command === 'sell') {
            this.sellCommand(steamID, message);
        } else if (command === 'get' && isAdmin) {
            this.getCommand(steamID, message);
        } else if (command === 'add' && isAdmin) {
            this.addCommand(steamID, message);
        } else if (command === 'remove' && isAdmin) {
            this.removeCommand(steamID, message);
        } else if (command === 'update' && isAdmin) {
            this.updateCommand(steamID, message);
        } else if (command === 'stop' && isAdmin) {
            this.stopCommand(steamID);
        } else if (command === 'restart' && isAdmin) {
            this.restartCommand(steamID);
        } else {
            this.bot.sendMessage(steamID, 'I don\'t know what you mean, please type "!help" for all my commands!');
        }
    }

    private helpCommand(steamID: SteamID): void {
        let reply = "Here's a list of all my commands:\n- " + COMMANDS.join('\n- ');

        if (this.bot.isAdmin(steamID)) {
            reply += '\n\nAdmin commands:\n- ' + ADMIN_COMMANDS.join('\n- ');
        }

        this.bot.sendMessage(steamID, reply);
    }

    private howToTradeCommand(steamID: SteamID): void {
        this.bot.sendMessage(
            steamID,
            'You can either send me an offer yourself, or use one of my commands to request a trade. Say you want to buy a Team Captain, just type "!buy Team Captain". Type "!help" for all the commands.'
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
            }

            // If the amount is 1, then don't convert to value and then to currencies. If it is for keys, then don't use conversion rate
            const currencies =
                amount === 1
                    ? match.buy
                    : Currencies.toCurrencies(
                          match.buy.toValue(keyPrice.metal) * amount,
                          isKey ? undefined : keyPrice.metal
                      );

            reply += pluralize(match.name, 2) + ' for ' + currencies.toString();
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
                name: this.bot.schema.getName(SKU.fromString(sku), false),
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

    private cartCommand(steamID: SteamID): void {
        this.bot.sendMessage(steamID, Cart.stringify(steamID));
    }

    private clearCartCommand(steamID: SteamID): void {
        Cart.removeCart(steamID);

        this.bot.sendMessage(steamID, 'Your cart has been cleared.');
    }

    private checkoutCommand(steamID: SteamID): void {
        const cart = Cart.getCart(steamID);

        if (cart === null) {
            this.bot.sendMessage(steamID, 'Your cart is empty.');
            return;
        }

        this.addCartToQueue(cart);
    }

    private addCartToQueue(cart: Cart): void {
        const activeOfferID = this.bot.trades.getActiveOffer(cart.partner);

        if (activeOfferID !== null) {
            this.bot.sendMessage(
                cart.partner,
                'You already have an active offer! Please finish it before requesting a new one:  https://steamcommunity.com/tradeoffer/' +
                    activeOfferID +
                    '/'
            );
            return;
        }

        const currentPosition = this.cartQueue.getPosition(cart.partner);

        if (currentPosition !== -1) {
            if (currentPosition === 0) {
                this.bot.sendMessage(
                    cart.partner,
                    'You are already in the queue! Please wait while I process your offer.'
                );
            } else {
                this.bot.sendMessage(
                    cart.partner,
                    'You are already in the queue! Please wait your turn, there ' +
                        (currentPosition !== 1 ? 'are' : 'is') +
                        ' ' +
                        currentPosition +
                        ' infront of you.'
                );
            }
            return;
        }

        const position = this.cartQueue.enqueue(cart);

        if (position !== 0) {
            this.bot.sendMessage(
                cart.partner,
                'You have been added to the queue! Please wait your turn, there ' +
                    (position !== 1 ? 'are' : 'is') +
                    ' ' +
                    position +
                    ' infront of you.'
            );
        }
    }

    private depositCommand(steamID: SteamID, message: string): void {
        const currentCart = Cart.getCart(steamID);
        if (currentCart !== null && !(currentCart instanceof AdminCart)) {
            this.bot.sendMessage(steamID, 'You already have a different cart open, finish it before making a new one.');
            return;
        }

        const paramStr = CommandParser.removeCommand(message);

        const params = CommandParser.parseParams(paramStr);

        if (params.sku === undefined) {
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        const sku = SKU.fromObject(fixItem(SKU.fromString(params.sku as string), this.bot.schema));
        const amount = typeof params.amount === 'number' ? params.amount : 1;

        const cart = AdminCart.getCart(steamID) || new AdminCart(steamID, this.bot);

        cart.addTheirItem(sku, amount);

        Cart.addCart(cart);

        const name = this.bot.schema.getName(SKU.fromString(sku), false);

        this.bot.sendMessage(
            steamID,
            pluralize(name, Math.abs(amount), true) +
                ' has been ' +
                (amount >= 0 ? 'added to' : 'removed from') +
                ' your cart.'
        );
    }

    private withdrawCommand(steamID: SteamID, message: string): void {
        const currentCart = Cart.getCart(steamID);
        if (currentCart !== null && !(currentCart instanceof AdminCart)) {
            this.bot.sendMessage(steamID, 'You already have a different cart open, finish it before making a new one.');
            return;
        }

        const paramStr = CommandParser.removeCommand(message);

        const params = CommandParser.parseParams(paramStr);

        if (params.sku === undefined) {
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        const sku = SKU.fromObject(fixItem(SKU.fromString(params.sku as string), this.bot.schema));
        let amount = typeof params.amount === 'number' ? params.amount : 1;

        const cart = AdminCart.getCart(steamID) || new AdminCart(steamID, this.bot);

        const cartAmount = cart.getOurCount(sku);
        const ourAmount = this.bot.inventoryManager.getInventory().getAmount(sku);
        const amountCanTrade = ourAmount - cart.getOurCount(sku) - cartAmount;

        const name = this.bot.schema.getName(SKU.fromString(sku), false);

        // Correct trade if needed
        if (amountCanTrade <= 0) {
            this.bot.sendMessage(
                steamID,
                "I don't have any " + (ourAmount > 0 ? 'more ' : '') + pluralize(name, 0) + '.'
            );
            amount = 0;
        } else if (amount > amountCanTrade) {
            amount = amountCanTrade;

            if (amount === cartAmount && cartAmount > 0) {
                this.bot.sendMessage(
                    steamID,
                    "I don't have any " + (ourAmount > 0 ? 'more ' : '') + pluralize(name, 0) + '.'
                );
                return;
            }

            this.bot.sendMessage(
                steamID,
                'I only have ' +
                    pluralize(name, amount, true) +
                    '. ' +
                    (amount > 1 ? 'They have' : 'It has') +
                    ' been added to your cart.'
            );
        } else {
            this.bot.sendMessage(
                steamID,
                pluralize(name, Math.abs(amount), true) +
                    ' has been ' +
                    (amount >= 0 ? 'added to' : 'removed from') +
                    ' your cart.'
            );
        }

        cart.addOurItem(sku, amount);

        Cart.addCart(cart);
    }

    private buyCartCommand(steamID: SteamID, message: string): void {
        const currentCart = Cart.getCart(steamID);
        if (currentCart !== null && !(currentCart instanceof UserCart)) {
            this.bot.sendMessage(steamID, 'You already have a different cart open, finish it before making a new one.');
            return;
        }

        const info = this.getItemAndAmount(steamID, CommandParser.removeCommand(message));

        if (info === null) {
            return;
        }

        const match = info.match;
        let amount = info.amount;

        const cart = Cart.getCart(steamID) || new UserCart(steamID, this.bot);

        const cartAmount = cart.getOurCount(match.sku);
        const ourAmount = this.bot.inventoryManager.getInventory().getAmount(match.sku);
        const amountCanTrade = this.bot.inventoryManager.amountCanTrade(match.sku, false) - cartAmount;

        const name = this.bot.schema.getName(SKU.fromString(match.sku), false);

        // Correct trade if needed
        if (amountCanTrade <= 0) {
            this.bot.sendMessage(
                steamID,
                'I ' +
                    (ourAmount > 0 ? "can't sell" : "don't have") +
                    ' any ' +
                    (cartAmount > 0 ? 'more ' : '') +
                    pluralize(name, 0) +
                    '.'
            );
            return;
        }

        if (amount > amountCanTrade) {
            amount = amountCanTrade;

            if (amount === cartAmount && cartAmount > 0) {
                this.bot.sendMessage(
                    steamID,
                    "I don't have any " + (ourAmount > 0 ? 'more ' : '') + pluralize(name, 0) + '.'
                );
                return;
            }

            this.bot.sendMessage(
                steamID,
                'I can only sell ' +
                    pluralize(name, amount, true) +
                    '. ' +
                    (amount > 1 ? 'They have' : 'It has') +
                    ' been added to your cart.'
            );
        } else {
            this.bot.sendMessage(steamID, pluralize(name, Math.abs(amount), true) + ' has been added to your cart.');
        }

        cart.addOurItem(match.sku, amount);

        Cart.addCart(cart);
    }

    private sellCartCommand(steamID: SteamID, message: string): void {
        const currentCart = Cart.getCart(steamID);
        if (currentCart !== null && !(currentCart instanceof UserCart)) {
            this.bot.sendMessage(steamID, 'You already have a different cart open, finish it before making a new one.');
            return;
        }

        const info = this.getItemAndAmount(steamID, CommandParser.removeCommand(message));

        if (info === null) {
            return;
        }

        const match = info.match;
        let amount = info.amount;

        const cart = Cart.getCart(steamID) || new UserCart(steamID, this.bot);

        const cartAmount = cart.getOurCount(match.sku);
        const ourAmount = this.bot.inventoryManager.getInventory().getAmount(match.sku);
        const amountCanTrade = this.bot.inventoryManager.amountCanTrade(match.sku, true) - cartAmount;

        const name = this.bot.schema.getName(SKU.fromString(match.sku), false);

        // Correct trade if needed
        if (amountCanTrade <= 0) {
            this.bot.sendMessage(
                steamID,
                'I ' +
                    (ourAmount > 0 ? "can't buy" : "don't want") +
                    ' any ' +
                    (cartAmount > 0 ? 'more ' : '') +
                    pluralize(name, 0) +
                    '.'
            );
            return;
        }

        if (amount > amountCanTrade) {
            amount = amountCanTrade;

            if (amount === cartAmount && cartAmount > 0) {
                this.bot.sendMessage(steamID, "I don't want any more " + pluralize(name, 0) + '.');
                return;
            }

            this.bot.sendMessage(
                steamID,
                'I can only buy ' +
                    pluralize(name, amount, true) +
                    '. ' +
                    (amount > 1 ? 'They have' : 'It has') +
                    ' been added to your cart.'
            );
        } else {
            this.bot.sendMessage(steamID, pluralize(name, Math.abs(amount), true) + ' has been added to your cart.');
        }

        cart.addTheirItem(match.sku, amount);

        Cart.addCart(cart);
    }

    private buyCommand(steamID: SteamID, message: string): void {
        const info = this.getItemAndAmount(steamID, CommandParser.removeCommand(message));

        if (info === null) {
            return;
        }

        const match = info.match;
        const amount = info.amount;

        const cart = new UserCart(steamID, this.bot);

        cart.addOurItem(match.sku, amount);

        this.addCartToQueue(cart);
    }

    private sellCommand(steamID: SteamID, message: string): void {
        const info = this.getItemAndAmount(steamID, CommandParser.removeCommand(message));

        if (info === null) {
            return;
        }

        const match = info.match;
        const amount = info.amount;

        const cart = new UserCart(steamID, this.bot);

        cart.addTheirItem(match.sku, amount);

        this.addCartToQueue(cart);
    }

    private getCommand(steamID: SteamID, message: string): void {
        const params = CommandParser.parseParams(CommandParser.removeCommand(message));

        if (params.item !== undefined) {
            // Remove by full name
            let match = this.bot.pricelist.searchByName(params.item as string, false);

            if (match === null) {
                this.bot.sendMessage(
                    steamID,
                    'I could not find any items in my pricelist that contains "' + params.item + '"'
                );
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply =
                    "I've found " +
                    match.length +
                    ' items. Try with one of the items shown below:\n' +
                    match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                this.bot.sendMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        if (params.sku === undefined) {
            this.bot.sendMessage(steamID, 'Missing item');
            return;
        }

        const match = this.bot.pricelist.getPrice(params.sku as string);

        if (match === null) {
            this.bot.sendMessage(steamID, 'Could not find item "' + params.sku + '" in the pricelist');
        } else {
            this.bot.sendMessage(steamID, '/code ' + JSON.stringify(match, null, 4));
        }
    }

    private addCommand(steamID: SteamID, message: string): void {
        const params = CommandParser.parseParams(CommandParser.removeCommand(message)) as any;

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
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        this.bot.pricelist
            .addPrice(params as EntryData, true)
            .then(entry => {
                this.bot.sendMessage(steamID, 'Added "' + entry.name + '".');
            })
            .catch(err => {
                this.bot.sendMessage(steamID, 'Failed to add the item to the pricelist: ' + err.message);
            });
    }

    private updateCommand(steamID: SteamID, message: string): void {
        const params = CommandParser.parseParams(CommandParser.removeCommand(message));

        if (typeof params.intent === 'string') {
            const intent = ['buy', 'sell', 'bank'].indexOf(params.intent.toLowerCase());
            if (intent !== -1) {
                params.intent = intent;
            }
        }

        if (params.all === true) {
            // TODO: Must have atleast one other param
            const pricelist = this.bot.pricelist.getPrices();

            if (pricelist.length === 0) {
                this.bot.sendMessage(steamID, 'Your pricelist is empty.');
                return;
            }

            for (let i = 0; i < pricelist.length; i++) {
                if (params.intent) {
                    pricelist[i].intent = params.intent as 0 | 1 | 2;
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
                    const errors = validator(
                        {
                            sku: pricelist[i].sku,
                            enabled: pricelist[i].enabled,
                            intent: pricelist[i].intent,
                            max: pricelist[i].max,
                            min: pricelist[i].min,
                            autoprice: pricelist[i].autoprice,
                            buy: pricelist[i].buy.toJSON(),
                            sell: pricelist[i].sell.toJSON(),
                            time: pricelist[i].time
                        },
                        'pricelist'
                    );

                    if (errors !== null) {
                        throw new Error(errors.join(', '));
                    }
                }
            }

            // FIXME: Make it so that it is not needed to remove all listings

            if (params.autoprice !== true) {
                this.bot.getHandler().onPricelist(pricelist);
                this.bot.sendMessage(steamID, 'Updated pricelist!');
                this.bot.listings.redoListings().asCallback();
                return;
            }

            this.bot.sendMessage(steamID, 'Updating prices...');

            this.bot.pricelist
                .setupPricelist()
                .then(() => {
                    this.bot.sendMessage(steamID, 'Updated pricelist!');
                    this.bot.listings.redoListings().asCallback();
                })
                .catch(err => {
                    log.warn('Failed to update prices: ', err);
                    this.bot.sendMessage(steamID, 'Failed to update prices: ' + err.message);
                    return;
                });
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
            let match = this.bot.pricelist.searchByName(params.item as string, false);

            if (match === null) {
                this.bot.sendMessage(
                    steamID,
                    'I could not find any items in my pricelist that contains "' + params.item + '"'
                );
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply =
                    "I've found " +
                    match.length +
                    ' items. Try with one of the items shown below:\n' +
                    match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                this.bot.sendMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        if (!this.bot.pricelist.hasPrice(params.sku as string)) {
            this.bot.sendMessage(steamID, 'Item is not in the pricelist.');
            return;
        }

        const entryData = this.bot.pricelist.getPrice(params.sku as string, false).getJSON();

        delete entryData.time;
        delete params.sku;

        if (Object.keys(params).length === 0) {
            this.bot.sendMessage(steamID, 'Missing properties to update.');
            return;
        }

        // Update entry
        for (const property in params) {
            if (!Object.prototype.hasOwnProperty.call(params, property)) {
                continue;
            }

            entryData[property] = params[property];
        }

        this.bot.pricelist
            .updatePrice(entryData, true)
            .then(entry => {
                this.bot.sendMessage(steamID, 'Updated "' + entry.name + '".');
            })
            .catch(err => {
                this.bot.sendMessage(
                    steamID,
                    'Failed to update pricelist entry: ' +
                        (err.body && err.body.message ? err.body.message : err.message)
                );
            });
    }

    private stopCommand(steamID: SteamID): void {
        this.bot.sendMessage(steamID, 'Stopping...');

        this.bot.botManager.stopProcess().catch(err => {
            log.warn('Error occurred while trying to stop: ', err);
            this.bot.sendMessage(steamID, 'An error occurred while trying to stop: ' + err.message);
        });
    }

    private restartCommand(steamID: SteamID): void {
        this.bot.sendMessage(steamID, 'Restarting...');

        this.bot.botManager
            .restartProcess()
            .then(restarting => {
                if (!restarting) {
                    this.bot.sendMessage(
                        steamID,
                        'You are not running the bot with PM2! See the documentation: https://github.com/Nicklason/tf2-automatic/wiki/PM2'
                    );
                }
            })
            .catch(err => {
                log.warn('Error occurred while trying to restart: ', err);
                this.bot.sendMessage(steamID, 'An error occurred while trying to restart: ' + err.message);
            });
    }

    private removeCommand(steamID: SteamID, message: string): void {
        const params = CommandParser.parseParams(CommandParser.removeCommand(message));

        if (params.item !== undefined) {
            // Remove by full name
            let match = this.bot.pricelist.searchByName(params.item as string, false);

            if (match === null) {
                this.bot.sendMessage(
                    steamID,
                    'I could not find any items in my pricelist that contains "' + params.item + '"'
                );
                return;
            } else if (Array.isArray(match)) {
                const matchCount = match.length;
                if (match.length > 20) {
                    match = match.splice(0, 20);
                }

                let reply =
                    "I've found " +
                    match.length +
                    ' items. Try with one of the items shown below:\n' +
                    match.join(',\n');
                if (matchCount > match.length) {
                    const other = matchCount - match.length;
                    reply += ',\nand ' + other + ' other ' + pluralize('item', other) + '.';
                }

                this.bot.sendMessage(steamID, reply);
                return;
            }

            delete params.item;
            params.sku = match.sku;
        } else if (params.sku === undefined) {
            const item = this.getItemFromParams(steamID, params);

            if (item === null) {
                return;
            }

            params.sku = SKU.fromObject(item);
        }

        this.bot.pricelist
            .removePrice(params.sku as string, true)
            .then(entry => {
                this.bot.sendMessage(steamID, 'Removed "' + entry.name + '".');
            })
            .catch(err => {
                this.bot.sendMessage(steamID, 'Failed to remove pricelist entry: ' + err.message);
            });
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
                    'Could not find an item in the schema with the name "' + params.name + '".'
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
            this.bot.sendMessage(steamID, 'Missing item properties.');
            return null;
        }

        if (params.defindex !== undefined) {
            const schemaItem = this.bot.schema.getItemByDefindex(params.defindex as number);

            if (schemaItem === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find an item in the schema with the defindex "' + params.defindex + '".'
                );
                return null;
            }

            item.defindex = schemaItem.defindex;

            if (item.quality === 0) {
                item.quality = schemaItem.item_quality;
            }
        }

        if (params.quality !== undefined) {
            const quality = this.bot.schema.getQualityIdByName(params.quality as string);
            if (quality === null) {
                this.bot.sendMessage(
                    steamID,
                    'Could not find a quality in the schema with the name "' + params.quality + '".'
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
                    'Could not find a skin in the schema with the name "' + item.paintkit + '".'
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
                    'Could not find an unusual effect in the schema with the name "' + params.effect + '".'
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
                    'Could not find an item in the schema with the defindex "' + params.defindex + '".'
                );
                return null;
            }

            if (item.outputQuality === null) {
                item.quality = schemaItem.item_quality;
            }
        } else if (item.output !== null) {
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
                    'Could not find an item in the schema with the name "' + params.name + '".'
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
                    'Could not find a quality in the schema with the name "' + params.outputQuality + '".'
                );
                return null;
            }

            item.outputQuality = quality;
        }

        for (const key in params) {
            if (!Object.prototype.hasOwnProperty.call(params, key)) {
                continue;
            }

            if (item[key] !== undefined) {
                delete params[key];
            }
        }

        delete params.name;

        return fixItem(item, this.bot.schema);
    }
};
