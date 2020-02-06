import SteamID from 'steamid';
import { UnknownDictionary } from '../types/common';

import Bot from './Bot';
import SteamTradeOfferManager from 'steam-tradeoffer-manager';

export = Cart;

/**
 * An abstract class used for sending offers
 *
 * @remarks Add and remove specific types of items to an offer and send it
 */
abstract class Cart {
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

    removeOurItem(sku: string, amount = 1): void {
        this.addOurItem(sku, -amount);
    }

    removeTheirItem(sku: string, amount = 1): void {
        this.addTheirItem(sku, -amount);
    }

    clear(): void {
        this.our = {};
        this.their = {};
    }

    isEmpty(): boolean {
        return Object.keys(this.our).length === 0 && Object.keys(this.their).length === 0;
    }

    abstract constructOffer(): Promise<any>;

    sendOffer(): Promise<string | void> {
        return this.bot.trades.sendOffer(this.offer).catch(err => {
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
                    'An error occurred while sending the offer (' + SteamTradeOfferManager.EResult[err.eresult] + ')'
                );
            }

            return Promise.reject(err);
        });
    }
}
