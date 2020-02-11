import SteamID from 'steamid';
import moment from 'moment';
import SKU from 'tf2-sku';
import SteamTradeOfferManager from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';

import Bot from './Bot';
import { UnknownDictionary } from '../types/common';

export = Cart;

/**
 * An abstract class used for sending offers
 *
 * @remarks Add and remove specific types of items to an offer and send it
 */
abstract class Cart {
    private static carts: UnknownDictionary<Cart> = {};

    readonly partner: SteamID;

    protected offer: SteamTradeOfferManager.TradeOffer | null = null;

    protected readonly bot: Bot;

    // TODO: Make it possible to add specific items to the cart

    protected our: UnknownDictionary<number> = {};

    protected their: UnknownDictionary<number> = {};

    constructor(partner: SteamID, bot: Bot) {
        this.partner = partner;
        this.bot = bot;
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

    summarize(): string {
        const ourSummary = this.summarizeOur();

        let ourSummaryString: string;

        if (ourSummary.length > 1) {
            ourSummaryString =
                ourSummary.slice(0, ourSummary.length - 1).join(', ') + ' and ' + ourSummary[ourSummary.length - 1];
        } else {
            ourSummaryString = ourSummary.join(', ');
        }

        const theirSummary = this.summarizeTheir();

        let theirSummaryString: string;

        if (theirSummary.length > 1) {
            theirSummaryString =
                ourSummary.slice(0, theirSummary.length - 1).join(', ') +
                ' and ' +
                theirSummary[theirSummary.length - 1];
        } else {
            theirSummaryString = theirSummary.join(', ');
        }

        return 'You will be offered ' + ourSummaryString + ' for ' + theirSummaryString;
    }

    summarizeOur(): string[] {
        const items: { name: string; amount: number }[] = [];

        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            items.push({ name: this.bot.schema.getName(SKU.fromString(sku), false), amount: this.our[sku] });
        }

        let summary: string[];

        if (items.length <= 1) {
            summary = items.map(v => {
                if (v.amount === 1) {
                    return 'a ' + v.name;
                } else {
                    return pluralize(v.name, v.amount, true);
                }
            });
        } else {
            summary = items.map(v => pluralize(v.name, v.amount, true));
        }

        /* if (summary.length > 1) {
            return summary.slice(0, summary.length - 1).join(', ') + ' and ' + summary[0];
        } */

        return summary;
    }

    summarizeTheir(): string[] {
        const items: { name: string; amount: number }[] = [];

        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            items.push({ name: this.bot.schema.getName(SKU.fromString(sku), false), amount: this.their[sku] });
        }

        let summary: string[];

        if (items.length <= 1) {
            summary = items.map(v => {
                if (v.amount === 1) {
                    return 'a ' + v.name;
                } else {
                    return pluralize(v.name, v.amount, true);
                }
            });
        } else {
            summary = items.map(v => pluralize(v.name, v.amount, true));
        }

        return summary;
    }

    protected abstract preSendOffer(): Promise<void>;

    abstract constructOffer(): Promise<string>;

    sendOffer(): Promise<string | void> {
        if (this.isEmpty()) {
            return Promise.reject("I don't or you don't have enough items for this trade");
        }

        if (this.offer === null) {
            return Promise.reject(new Error('Offer has not yet been constructed'));
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

        return this.preSendOffer()
            .then(() => {
                return this.bot.trades.sendOffer(this.offer);
            })
            .then(status => {
                // Offer finished, remove cart
                Cart.removeCart(this.partner);

                return status;
            })
            .catch(err => {
                if (err.cause === 'TradeBan') {
                    return Promise.reject('You are trade banned');
                } else if (err.cause === 'ItemServerUnavailable') {
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

            const name = this.bot.schema.getName(SKU.fromString(sku), false);
            str += '\n- ' + this.our[sku] + 'x ' + name;
        }

        str += '\n\nYour side (items you will lose):';
        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            const name = this.bot.schema.getName(SKU.fromString(sku), false);
            str += '\n- ' + this.their[sku] + 'x ' + name;
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
