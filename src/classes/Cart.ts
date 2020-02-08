import SteamID from 'steamid';
import moment from 'moment';
import SKU from 'tf2-sku';
import pluralize from 'pluralize';
import SteamTradeOfferManager from 'steam-tradeoffer-manager';
import Currencies from 'tf2-currencies';

import Bot from './Bot';
import Inventory from './Inventory';
import { UnknownDictionary } from '../types/common';

export = Cart;

/**
 * An abstract class used for sending offers
 *
 * @remarks Add and remove specific types of items to an offer and send it
 */
class Cart {
    private static carts: UnknownDictionary<Cart> = {};

    readonly partner: SteamID;

    protected offer: SteamTradeOfferManager.TradeOffer | null = null;

    protected readonly bot: Bot;

    // TODO: Make it possible to add specific items to the cart

    protected our: UnknownDictionary<number> = {};

    protected their: UnknownDictionary<number> = {};

    protected ourCurrencies: Currencies = new Currencies({});

    protected theirCurrencies: Currencies = new Currencies({});

    constructor(partner: SteamID, bot: Bot) {
        this.partner = partner;
        this.bot = bot;
    }

    setOurCurrencies(currencies: Currencies): void {
        this.ourCurrencies = currencies;
    }

    setTheirCurrencies(currencies: Currencies): void {
        this.theirCurrencies = currencies;
    }

    getOurCount(sku: string): number {
        return this.our[sku] || 0;
    }

    getTheirCount(sku: string): number {
        return this.their[sku] || 0;
    }

    addOurItem(sku: string, amount = 1): void {
        this.our[sku] = this.getOurCount(sku) + amount;

        if (this.our[sku] < 1) {
            delete this.our[sku];
        }
    }

    addTheirItem(sku: string, amount = 1): void {
        this.their[sku] = this.getTheirCount(sku) + amount;

        if (this.their[sku] < 1) {
            delete this.their[sku];
        }
    }

    removeOurItem(sku: string, amount: number | undefined = 1): void {
        if (amount === undefined) {
            delete this.our[sku];
        } else {
            this.addOurItem(sku, -amount);
        }
    }

    removeTheirItem(sku: string, amount: number | undefined = 1): void {
        if (amount === undefined) {
            delete this.their[sku];
        } else {
            this.addTheirItem(sku, -amount);
        }
    }

    clear(): void {
        this.our = {};
        this.their = {};
    }

    isEmpty(): boolean {
        return Object.keys(this.our).length === 0 && Object.keys(this.their).length === 0;
    }

    protected preSendOffer(): Promise<void> {
        if (this.bot.isAdmin(this.partner)) {
            return Promise.resolve();
        }

        // TODO: Check escrow and bans
        return Promise.resolve();
    }

    protected constructOffer(): Promise<string | void> {
        return new Promise((resolve, reject) => {
            if (this.isEmpty()) {
                return reject('cart is empty');
            }

            // TODO: Add currencies

            const offer = this.bot.manager.createOffer(this.partner);

            const alteredMessages: string[] = [];

            // Add our items
            const ourInventory = this.bot.inventoryManager.getInventory();

            for (const sku in this.our) {
                if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                    continue;
                }

                let amount = this.getOurCount(sku);
                const ourAssetids = ourInventory.findBySKU(sku, true);

                if (amount > ourAssetids.length) {
                    amount = ourAssetids.length;
                    // Remove the item from the cart
                    this.removeOurItem(sku);

                    if (ourAssetids.length === 0) {
                        alteredMessages.push(
                            "I don't have any " + pluralize(this.bot.schema.getName(SKU.fromString(sku)))
                        );
                    } else {
                        alteredMessages.push(
                            'I only have ' +
                                pluralize(this.bot.schema.getName(SKU.fromString(sku)), ourAssetids.length, true)
                        );

                        // Add the max amount to the offer
                        this.addOurItem(sku, ourAssetids.length);
                    }
                }

                for (let i = 0; i < amount; i++) {
                    offer.addMyItem({
                        appid: 440,
                        contextid: '2',
                        assetid: ourAssetids[i]
                    });
                }
            }

            if (Object.keys(this.their).length === 0) {
                // Done constructing offer

                this.offer = offer;

                return resolve(alteredMessages.length === 0 ? undefined : alteredMessages.join(', '));
            }

            // Load their inventory

            const theirInventory = new Inventory(this.partner, this.bot.manager, this.bot.schema);

            theirInventory.fetch().asCallback(err => {
                if (err) {
                    return reject('Failed to load inventories (Steam might be down)');
                }

                // Add their items

                for (const sku in this.their) {
                    if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                        continue;
                    }

                    let amount = this.getTheirCount(sku);
                    const theirAssetids = theirInventory.findBySKU(sku, true);

                    if (amount > theirAssetids.length) {
                        amount = theirAssetids.length;
                        // Remove the item from the cart
                        this.removeTheirItem(sku);

                        if (theirAssetids.length === 0) {
                            alteredMessages.push(
                                "you don't have any " + pluralize(this.bot.schema.getName(SKU.fromString(sku)))
                            );
                        } else {
                            alteredMessages.push(
                                'you only have ' +
                                    pluralize(this.bot.schema.getName(SKU.fromString(sku)), theirAssetids.length, true)
                            );

                            // Add the max amount to the offer
                            this.addTheirItem(sku, theirAssetids.length);
                        }
                    }

                    for (let i = 0; i < amount; i++) {
                        offer.addTheirItem({
                            appid: 440,
                            contextid: '2',
                            assetid: theirAssetids[i]
                        });
                    }
                }

                this.offer = offer;

                return resolve(alteredMessages.length === 0 ? undefined : alteredMessages.join(', '));
            });
        });
    }

    async sendOffer(): Promise<string | void> {
        const alteredMessage = await this.constructOffer();

        if (alteredMessage) {
            this.bot.sendMessage(this.partner, 'Your offer has been altered: ' + alteredMessage);
        }

        const itemsDiff: UnknownDictionary<number> = {};

        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            itemsDiff[sku] = (itemsDiff[sku] || 0) + this.our[sku];
        }

        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            itemsDiff[sku] = (itemsDiff[sku] || 0) - this.their[sku];
        }

        this.offer.data('dict', { our: this.our, their: this.their });
        this.offer.data('diff', itemsDiff);
        this.offer.data('handleTimestamp', moment().valueOf());

        this.offer.setMessage(
            process.env.OFFER_MESSAGE ||
                'Powered by TF2 Automatic. For more information see https://github.com/Nicklason/tf2-automatic'
        );

        await this.preSendOffer();

        return this.bot.trades
            .sendOffer(this.offer)
            .then(() => {
                // Offer finished, remove cart
                Cart.removeCart(this.partner);
            })
            .catch(err => {
                if (err.message.indexOf("We were unable to contact the game's item server") !== -1) {
                    return Promise.reject(
                        "Team Fortress 2's item server may be down or Steam may be experiencing temporary connectivity issues"
                    );
                } else if (err.message.indexOf('can only be sent to friends') != -1) {
                    // Just adding it here so that it is saved for future reference
                    return Promise.reject(err);
                } else if (err.message.indexOf('maximum number of items allowed in your Team Fortress 2 inventory')) {
                    return Promise.reject("I don't have space for more items in my inventory");
                } else if (err.eresult == 10 || err.eresult == 16) {
                    return Promise.reject(
                        "An error occurred while sending your trade offer, this is most likely because I've recently accepted a big offer"
                    );
                } else if (err.eresult == 15) {
                    return Promise.reject("I don't, or you don't, have space for more items");
                } else if (err.eresult == 20) {
                    return Promise.reject(
                        "Team Fortress 2's item server may be down or Steam may be experiencing temporary connectivity issues"
                    );
                } else if (err.eresult !== undefined) {
                    return Promise.reject(
                        'An error occurred while sending the offer (' +
                            SteamTradeOfferManager.EResult[err.eresult] +
                            ')'
                    );
                }

                return Promise.reject(err);
            });
    }

    toString(): string {
        if (this.isEmpty()) {
            return 'Your cart is empty.';
        }

        let str = '== YOUR CART ==';

        str += '\n\nMy side (items you will receive):';
        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            const name = this.bot.schema.getName(SKU.fromString(sku));
            str += '\n- ' + this.our[sku] + 'x ' + name;
        }

        if (Object.keys(this.our).length === 0) {
            str += '\n' + this.ourCurrencies.toString();
        } else {
            str += '\nand ' + this.ourCurrencies.toString();
        }

        str += '\n\nYour side (items you will lose):';
        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            const name = this.bot.schema.getName(SKU.fromString(sku));
            str += '\n- ' + this.their[sku] + 'x ' + name;
        }

        if (Object.keys(this.their).length === 0) {
            str += '\n' + this.theirCurrencies.toString();
        } else {
            str += '\nand ' + this.theirCurrencies.toString();
        }

        return str;
    }

    static hasCart(steamID: SteamID): boolean {
        return this.carts[steamID.getSteamID64()] !== undefined;
    }

    static getCart(steamID: SteamID): Cart {
        if (!this.hasCart(steamID)) {
            return null;
        }

        return this.carts[steamID.getSteamID64()];
    }

    static addCart(cart: Cart): void {
        this.carts[cart.partner.getSteamID64()] = cart;
    }

    static removeCart(steamID: SteamID): void {
        delete this.carts[steamID.getSteamID64()];
    }

    static stringify(steamID: SteamID): string {
        const cart = this.getCart(steamID);

        if (cart === null) {
            return 'Your cart is empty.';
        }

        return cart.toString();
    }
}
