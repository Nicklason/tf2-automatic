import { UnknownDictionary } from '../../types/common';
import SteamID from 'steamid';

import TradeOfferManager from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';
import SKU from 'tf2-sku';
import async from 'async';

import inventory from '../inventory';
import schemaManager from '../../lib/tf2-schema';
import manager from '../../lib/manager';
import client from '../../lib/client';

class Cart {
    our: UnknownDictionary<number>;
    their: UnknownDictionary<number>;

    constructor (our?: UnknownDictionary<number>, their?: UnknownDictionary<number>) {
        this.our = (our || {});
        this.their = (their || {});
    }

    get () {
        return { our: this.our, their: this.their };
    }

    amount (sku: string, whose: 'our' | 'their'): number {
        if (!this._exist(sku, whose)) {
            return 0;
        }

        return this[whose][sku];
    }

    add (sku: string, amount: number, whose: 'our' | 'their'): void {
        if (!this._exist(sku, whose)) {
            this[whose][sku] = amount;
        } else {
            this[whose][sku] += amount;
        }
    }

    remove (sku: string, amount: number, whose: 'our' | 'their'): void {
        if (this._exist(sku, whose)) {
            this[whose][sku] -= amount;
            if (this[whose][sku] <= 0) {
                delete this[whose][sku];
            }
        }
    }

    clear (): void {
        this.our = {};
        this.their = {};
    }

    isEmpty (): boolean {
        return Object.keys(this.our).length === 0 && Object.keys(this.their).length === 0;
    }

    toString (): string {
        let message = '== YOUR CART ==';

        message += '\n\nMy side (items you will receive):';
        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            const name = schemaManager.schema.getName(SKU.fromString(sku));
            message += '\n- ' + this.our[sku] + 'x ' + name;
        }

        message += '\n\nYour side (items you will lose):';
        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            const name = schemaManager.schema.getName(SKU.fromString(sku));
            message += '\n- ' + this.their[sku] + 'x ' + name;
        }

        return message;
    }

    _exist (sku: string, whose: string): boolean {
        return this[whose][sku] ? true : false;
    }
}


const carts = {};

function createCart (steamID: SteamID|string, our?: UnknownDictionary<number>, their?: UnknownDictionary<number>): void {
    carts[steamID.toString()] = new Cart(our, their);
}

function cartExists (steamID: SteamID|string): boolean {
    return getCart(steamID) !== null;
}

function deleteCart (steamID: SteamID|string) {
    delete carts[steamID.toString()];
}

function getCart (steamID: SteamID|string): Cart {
    return carts[steamID.toString()] || null;
}

export function addToCart (steamID: SteamID|string, sku: string, amount: number, deposit: boolean) {
    const side = deposit ? 'their' : 'our';

    const name = schemaManager.schema.getName(SKU.fromString(sku));

    let message: string;

    if (deposit) {
        message = pluralize(name, amount, true) + ' ' + (amount > 1 ? 'have' : 'has') + ' been added to your cart';
    } else {
        // Get all items in inventory, we don't need to check stock limits for withdrawals
        const amountCanTrade = inventory.getAmount(sku) - (cartExists(steamID) ? getCart(steamID).amount(sku, side) : 0);

        // Correct trade if needed
        if (amountCanTrade <= 0) {
            message = 'I don\'t have any ' + pluralize(name, 0);
            amount = 0;
        } else if (amountCanTrade < amount) {
            amount = amountCanTrade;
            message = 'I only have ' + pluralize(name, amount, true) + '. ' + (amount > 1 ? 'They have' : 'It has') + ' been added to your cart';
        } else {
            message = pluralize(name, amount, true) + ' ' + (amount > 1 ? 'have' : 'has') + ' been added to your cart';
        }
    }

    if (amount > 0) {
        if (!cartExists(steamID)) {
            createCart(steamID);
        }

        getCart(steamID).add(sku, amount, side);
    }

    return { cart: getCart(steamID), message };
};

export function removeAllFromCart (steamID: SteamID|string) {
    if (!cartExists(steamID)) {
        return { cart: null, message: 'Your cart is empty' };
    }

    getCart(steamID).clear();

    if (getCart(steamID).isEmpty()) {
        deleteCart(steamID);
    }

    return { cart: null, message: 'Your cart is empty' };
}

export function removeFromCart (steamID: SteamID|string, sku: string, amount: number, our: boolean) {
    if (!cartExists(steamID)) {
        return { cart: null, message: 'Your cart is empty' };
    }

    let message: string;

    const name = sku ? schemaManager.schema.getName(SKU.fromString(sku)) : undefined;

    const whose = our ? 'our' : 'their';

    const sideString = our ? 'my' : 'your';

    const inCart = getCart(steamID).amount(sku, whose);

    if (inCart === 0) {
        amount = inCart;
        message = 'There are no ' + pluralize(name, amount) + ' on ' + sideString + ' side of the cart';
    } else if (amount > inCart) {
        amount = inCart;
        message = 'There were only ' + pluralize(name, amount, true) + ' on ' + sideString + ' side of the cart. ' + (amount > 1 ? 'They have' : 'It has') + ' been removed';
    } else {
        message = pluralize(name, amount, true) + (amount > 1 ? ' have' : ' has') + ' been removed from ' + sideString + ' side of the cart';
    }

    getCart(steamID).remove(sku, amount, whose);

    if (getCart(steamID).isEmpty()) {
        deleteCart(steamID);
        return { cart: null, message };
    }

    return { cart: getCart(steamID), message };
};

export function checkout (partner: SteamID|string, callback: (err?: Error, failedMessage?: string) => void): void {
    const start = new Date().getTime();

    if (!cartExists(partner)) {
        callback(null, 'Failed to send offer: Your cart is empty');
        return;
    }

    client.chatMessage(partner, 'Please wait while I process your offer...');

    const alteredItems: { our: string[], their: string[] } = { our: [], their: [] };
    let alteredMessage: string;

    const cart = getCart(partner);

    // Check if we have all the items requested
    for (const sku in cart.our) {
        if (!Object.prototype.hasOwnProperty.call(cart.our, sku)) {
            continue;
        }

        const amountCanTrade = inventory.findBySKU(sku, false).length;
        const amountInCart = cart.amount(sku, 'our');

        if (amountInCart > amountCanTrade) {
            if (amountCanTrade === 0) {
                cart.remove(sku, amountInCart, 'our');
            } else {
                cart.remove(sku, (amountInCart-amountCanTrade), 'our');
            }
            // @ts-ignore
            alteredItems.our.push(sku);
        }
    }

    if (Object.keys(cart.our).length === 0 && Object.keys(cart.their).length === 0) {
        alteredMessage = createAlteredMessage(partner, alteredItems);
        callback(null, 'Failed to send offer: ' + alteredMessage);
        return;
    }

    const offer = manager.createOffer(partner);

    offer.data('partner', partner);

    const itemsDict: { our: UnknownDictionary<number>, their: UnknownDictionary<number> } = { our: {}, their: {} };
    const itemsDiff: UnknownDictionary<number> = {};

    for (const sku in cart.our) {
        if (!Object.prototype.hasOwnProperty.call(cart.our, sku)) {
            continue;
        }

        const amount = cart.amount(sku, 'our');
        const assetids = inventory.findBySKU(sku, false);

        for (let i = 0; i < amount; i++) {
            offer.addMyItem({
                assetid: assetids[i],
                appid: 440,
                contextid: '2',
                amount: 1
            });
        }

        itemsDict.our[sku] = amount;
        itemsDiff[sku] = amount*(-1);
    }

    async.parallel({
        their: function (callback) {
            if (Object.keys(cart.their).length === 0) {
                // We are not taking any items, don't request their inventory
                callback(null);
                return;
            }

            inventory.getDictionary(partner, false, function (err, theirDict) {
                if (err) {
                    return callback(err);
                }

                callback(null, theirDict);
            });
        }
    }, function (err, inventories: { their: UnknownDictionary<string[]> }) {
        if (err) {
            callback(null, err);
            return;
        }

        if (!inventories.their) {
            alteredMessage = createAlteredMessage(partner, alteredItems);

            if (Object.keys(cart.our).length === 0) {
                deleteCart(partner);
                callback(null, 'Failed to send offer: ' + alteredMessage);
                return;
            }
        }

        for (const sku in cart.their) {
            if (!Object.prototype.hasOwnProperty.call(cart.their, sku)) {
                continue;
            }

            const assetids = (inventories.their[sku] || []);
            const amountCanTrade = assetids.length;
            const amountInCart = cart.amount(sku, 'their');

            if (amountInCart > amountCanTrade) {
                if (amountCanTrade === 0) {
                    cart.remove(sku, amountInCart, 'their');
                } else {
                    cart.remove(sku, (amountInCart-amountCanTrade), 'their');
                }
                alteredItems.their.push(sku);
            }

            if (!cart.amount(sku, 'their')) {
                continue;
            }

            const amount = cart.amount(sku, 'their');

            for (let i = 0; i < amount; i++) {
                offer.addTheirItem({
                    assetid: assetids[i],
                    appid: 440,
                    contextid: '2',
                    amount: 1
                });
            }

            itemsDict.their[sku] = amount;
            itemsDiff[sku] = (itemsDiff[sku] || 0) + amount;
        }

        alteredMessage = createAlteredMessage(partner, alteredItems);

        if ((Object.keys(cart.their).length === 0) && (Object.keys(cart.our).length === 0)) {
            deleteCart(partner);
            callback(null, 'Failed to send offer: ' + alteredMessage);
            return;
        }

        offer.data('dict', itemsDict);
        offer.data('diff', itemsDiff);

        offer.data('handleTimestamp', start);

        offer.setMessage(process.env.OFFER_MESSAGE || 'Powered by TF2 Automatic');

        if (alteredMessage) {
            client.chatMessage(partner, alteredMessage);
        }

        removeAllFromCart(partner);

        require('../trade').sendOffer(offer, function (err) {
            if (err) {
                if (err.message.indexOf('We were unable to contact the game\'s item server') !== -1) {
                    return callback(null, 'Team Fortress 2\'s item server may be down or Steam may be experiencing temporary connectivity issues');
                } else if (err.message.indexOf('can only be sent to friends') != -1) {
                    return callback(err);
                } else if (err.message.indexOf('maximum number of items allowed in your Team Fortress 2 inventory') > -1) {
                    return callback(null, 'I don\'t have space for more items in my inventory');
                } else if (err.eresult !== undefined) {
                    if (err.eresult == 10) {
                        callback(null, 'An error occurred while sending your trade offer, this is most likely because I\'ve recently accepted a big offer');
                    } else if (err.eresult == 15) {
                        callback(null, 'I don\'t, or you don\'t, have space for more items');
                    } else if (err.eresult == 16) {
                        // This happens when Steam is already handling an offer (usually big offers), the offer should be made
                        callback(null, 'An error occurred while sending your trade offer, this is most likely because I\'ve recently accepted a big offer');
                    } else if (err.eresult == 20) {
                        callback(null, 'Team Fortress 2\'s item server may be down or Steam may be experiencing temporary connectivity issues');
                    } else {
                        callback(null, 'An error occurred while sending the offer (' + TradeOfferManager.EResult[err.eresult] + ')');
                    }
                    return;
                }
            }

            return callback(err);
        });
    });
};

function createAlteredMessage (steamID: SteamID|string, alteredItems) {
    const noneAvailable = { our: 'I don\'t have any', their: 'You don\'t have any' };
    const someAvailable = { our: 'I only have', their: 'You only have' };

    const none = { our: [], their: [] };
    const some: { our: [{ name: string, amount: number }?], their: [{ name: string, amount: number }?] } = { our: [], their: [] };

    const cart = getCart(steamID);

    ['our', 'their'].forEach((whose) => {
        alteredItems[whose].forEach((sku) => {
            const name = schemaManager.schema.getName(SKU.fromString(sku));
            // @ts-ignore
            if (cart.amount(sku, whose)) {
                // @ts-ignore
                some[whose].push({ name, amount: cart.amount(sku, whose) });
            } else {
                none[whose].push(name);
            }
        });
    });

    ['our', 'their'].forEach((whose) => {
        none[whose].forEach((name, i) => {
            const last = (i === none[whose].length-1 && i > 0);

            if (last) {
                noneAvailable[whose] = noneAvailable[whose].slice(0, -1);
                noneAvailable[whose] += ' or';
            }

            noneAvailable[whose] += ' ' + pluralize(name, 0);

            if (!last && i > 0) {
                noneAvailable[whose] += ',';
            }
        });
    });

    ['our', 'their'].forEach((whose) => {
        some[whose].forEach((obj, i) => {
            const name = obj.name;
            const amount = obj.amount;

            const last = (i === some[whose].length-1 && i > 0);

            if (last) {
                someAvailable[whose] = someAvailable[whose].slice(0, -1);
                someAvailable[whose] += ' and';
            }

            someAvailable[whose] += ' ' + pluralize(name, amount, true);

            if (!last && i > 0) {
                someAvailable[whose] += ',';
            }
        });
    });

    let message = '';

    ['our', 'their'].forEach((whose) => {
        ['none', 'some'].forEach((which, i) => {
            if (i) {
                if (some[whose].length) {
                    message += someAvailable[whose] + '\n';
                }
            } else {
                if (none[whose].length) {
                    message += noneAvailable[whose] + '\n';
                }
            }
        });
    });

    return message;
}

export function stringify (steamID: SteamID|string) {
    const cart = getCart(steamID);

    if (cart === null || cart.isEmpty()) {
        return 'Your cart is empty';
    }

    return cart.toString();
};
