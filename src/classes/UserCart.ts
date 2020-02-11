import pluralize from 'pluralize';
import SKU from 'tf2-sku';
import Currencies from 'tf2-currencies';
import { CurrencyObject } from '../types/TeamFortress2';

import Cart from './Cart';
import Inventory from './Inventory';

import { isBanned } from '../lib/bans';
import log from '../lib/logger';

export = UserCart;

class UserCart extends Cart {
    /**
     * If we should give keys and metal or only metal (should be able to change this on checkout)
     */
    private useKeys = true;

    async preSendOffer(): Promise<void> {
        const [banned, escrow] = await Promise.all([isBanned(this.partner), this.bot.trades.checkEscrow(this.offer)]);

        if (banned) {
            return Promise.reject('you are banned in one or more trading communities');
        }

        if (escrow) {
            return Promise.reject('trade would be held');
        }
    }

    canUseKeys(): boolean {
        if (this.getOurCount('5021;6') !== 0 || this.getTheirCount('5021;6') !== 0) {
            // The trade contains keys, don't use keys for currencies
            return false;
        }

        return this.useKeys;
    }

    /**
     * Get relative currencies
     */
    getCurrencies(): { our: Currencies; their: Currencies } {
        const ourCurrencies = this.getOurCurrencies();
        const theirCurrencies = this.getTheirCurrencies();

        const keyPrice = this.bot.pricelist.getKeyPrice();

        const ourValue = ourCurrencies.toValue(keyPrice.metal);
        const theirValue = theirCurrencies.toValue(keyPrice.metal);

        const useKeys = this.canUseKeys();

        if (ourValue >= theirValue) {
            // Our value is greater, we are selling
            return {
                our: Currencies.toCurrencies(ourValue, useKeys ? keyPrice.metal : undefined),
                their: new Currencies({})
            };
        } else {
            // Our value is smaller, we are buying
            return {
                our: new Currencies({}),
                their: Currencies.toCurrencies(theirValue, useKeys ? keyPrice.metal : undefined)
            };
        }
    }

    getOurCurrencies(): Currencies {
        const keyPrice = this.bot.pricelist.getKeyPrice();

        let value = 0;

        // Go through our items
        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            const match = this.bot.pricelist.getPrice(sku, true);

            if (match === null) {
                // Ignore items that are no longer in the pricelist
                continue;
            }

            value += match.sell.toValue(keyPrice.metal) * this.our[sku];
        }

        return Currencies.toCurrencies(value, this.canUseKeys() ? keyPrice.metal : undefined);
    }

    getTheirCurrencies(): Currencies {
        const keyPrice = this.bot.pricelist.getKeyPrice();

        let value = 0;

        // Go through our items
        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            const match = this.bot.pricelist.getPrice(sku, true);

            if (match === null) {
                // Ignore items that are no longer in the pricelist
                continue;
            }

            value += match.buy.toValue(keyPrice.metal) * this.their[sku];
        }

        return Currencies.toCurrencies(value, this.canUseKeys() ? keyPrice.metal : undefined);
    }

    private getRequiredCurrencies(
        buyerCurrencies: CurrencyObject,
        price: Currencies,
        useKeys: boolean
    ): { currencies: CurrencyObject; change: number } {
        log.debug('Getting required currencies');

        const keyPrice = this.bot.pricelist.getKeyPrice();

        const value = price.toValue(useKeys ? keyPrice.metal : undefined);

        const currencyValues = {
            '5021;6': useKeys ? keyPrice.toValue() : -1,
            '5002;6': 9,
            '5001;6': 3,
            '5000;6': 1
        };

        log.debug('Currency values', currencyValues);

        const skus = Object.keys(currencyValues);

        let remaining = value;

        let hasReversed = false;
        let reverse = false;
        let index = 0;

        const pickedCurrencies: CurrencyObject = { '5021;6': 0, '5002;6': 0, '5001;6': 0, '5000;6': 0 };

        /* eslint-disable-next-line no-constant-condition */
        while (true) {
            const key = skus[index];
            // Start at highest currency and check if we should pick that

            // Amount to pick of the currency
            let amount = remaining / currencyValues[key];
            if (amount > buyerCurrencies[key]) {
                // We need more than we have, choose what we have
                amount = buyerCurrencies[key];
            }

            if (index === skus.length - 1) {
                // If we are at the end of the list and have a postive remaining amount,
                // then we need to loop the other way and pick the value that will make the remaining 0 or negative

                if (hasReversed) {
                    // We hit the end the second time, break out of the loop
                    break;
                }

                reverse = true;
            }

            const currAmount = pickedCurrencies[key] || 0;

            if (reverse && amount > 0) {
                // We are reversing the array and found an item that we need
                if (currAmount + Math.ceil(amount) > buyerCurrencies[key]) {
                    // Amount is more than the limit, set amount to the limit
                    amount = buyerCurrencies[key] - currAmount;
                } else {
                    amount = Math.ceil(amount);
                }
            }

            if (amount >= 1) {
                // If the amount is greater than or equal to 1, then I need to pick it
                pickedCurrencies[key] = currAmount + Math.floor(amount);
                // Remove value from remaining
                remaining -= Math.floor(amount) * currencyValues[key];
            }

            log.debug('Iteration', {
                index: index,
                key: key,
                amount: amount,
                remaining: remaining,
                reverse: reverse,
                hasReversed: hasReversed,
                picked: pickedCurrencies
            });

            if (remaining === 0) {
                // Picked the exact amount, stop
                break;
            }

            if (remaining < 0) {
                // We owe them money, break out of the loop
                break;
            }

            if (index === 0 && reverse) {
                // We were reversing and then reached start of the list, say that we have reversed and go back the other way
                hasReversed = true;
                reverse = false;
            }

            index += reverse ? -1 : 1;
        }

        log.debug('Done picking currencies', { remaining: remaining, picked: pickedCurrencies });

        if (remaining < 0) {
            log.debug('Picked too much value, removing...');

            // Removes unnessesary items
            for (let i = 0; i < skus.length; i++) {
                const sku = skus[i];

                if (pickedCurrencies[sku] === undefined) {
                    continue;
                }

                let amount = Math.floor(Math.abs(remaining) / currencyValues[sku]);
                if (pickedCurrencies[sku] < amount) {
                    amount = pickedCurrencies[sku];
                }

                if (amount >= 1) {
                    remaining += amount * currencyValues[sku];
                    pickedCurrencies[sku] -= amount;
                }

                log.debug('Iteration', { sku: sku, amount: amount, remaining: remaining, picked: pickedCurrencies });
            }
        }

        log.debug('Done constructing offer', { picked: pickedCurrencies, change: remaining });

        return {
            currencies: pickedCurrencies,
            change: remaining
        };
    }

    constructOffer(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (this.isEmpty()) {
                return reject('cart is empty');
            }

            // TODO: Finish constructing offer

            // Check amountCanTrade on each item

            // Get prices

            // Check if the buyer can afford to do the trade

            // Add metal from buyer and change from seller

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
                            "I don't have any " + pluralize(this.bot.schema.getName(SKU.fromString(sku), false))
                        );
                    } else {
                        alteredMessages.push(
                            'I only have ' +
                                pluralize(this.bot.schema.getName(SKU.fromString(sku), false), ourAssetids.length, true)
                        );

                        // Add the max amount to the offer
                        this.addOurItem(sku, ourAssetids.length);
                    }
                }

                const amountCanTrade = this.bot.inventoryManager.amountCanTrade(sku, false);

                if (amount > amountCanTrade) {
                    alteredMessages.push(
                        'I can only buy ' +
                            amountCanTrade +
                            ' more ' +
                            this.bot.schema.getName(SKU.fromString(sku), false)
                    );
                }

                for (let i = 0; i < amount; i++) {
                    offer.addMyItem({
                        appid: 440,
                        contextid: '2',
                        assetid: ourAssetids[i]
                    });
                }
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
                                "you don't have any " + pluralize(this.bot.schema.getName(SKU.fromString(sku), false))
                            );
                        } else {
                            alteredMessages.push(
                                'you only have ' +
                                    pluralize(
                                        this.bot.schema.getName(SKU.fromString(sku), false),
                                        theirAssetids.length,
                                        true
                                    )
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

    // We Override the toString function so that the currencies are added
    toString(): string {
        if (this.isEmpty()) {
            return 'Your cart is empty.';
        }

        const currencies = this.getCurrencies();

        let str = '== YOUR CART ==';

        str += '\n\nMy side (items you will receive):';
        for (const sku in this.our) {
            if (!Object.prototype.hasOwnProperty.call(this.our, sku)) {
                continue;
            }

            const name = this.bot.schema.getName(SKU.fromString(sku), false);
            str += '\n- ' + this.our[sku] + 'x ' + name;
        }

        if (currencies.our.keys === 0 && currencies.our.metal === 0) {
            // We don't offer any currencies, add their currencies to cart string because we are buying their value
            str += '\n' + (Object.keys(this.our).length === 0 ? '' : 'and ') + currencies.their.toString();
        }

        str += '\n\nYour side (items you will lose):';
        for (const sku in this.their) {
            if (!Object.prototype.hasOwnProperty.call(this.their, sku)) {
                continue;
            }

            const name = this.bot.schema.getName(SKU.fromString(sku), false);
            str += '\n- ' + this.their[sku] + 'x ' + name;
        }

        if (currencies.their.keys === 0 && currencies.their.metal === 0) {
            // They don't offer any currencies, add our currencies to cart string because they are buying our value
            str += '\n' + (Object.keys(this.their).length === 0 ? '' : 'and ') + currencies.our.toString();
        }

        return str;
    }
}
