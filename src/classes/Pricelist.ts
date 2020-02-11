import { Currency } from '../types/TeamFortress2';
import { UnknownDictionary } from '../types/common';

import { EventEmitter } from 'events';
import moment from 'moment';
import Currencies from 'tf2-currencies';
import SKU from 'tf2-sku';
import SchemaManager from 'tf2-schema';

import log from '../lib/logger';
import { getPricelist, getPrice } from '../lib/ptf-api';

const maxAge = parseInt(process.env.MAX_PRICE_AGE) || 8 * 60 * 60;

export interface EntryData {
    sku: string;
    enabled: boolean;
    autoprice: boolean;
    max: number;
    min: number;
    intent: 0 | 1 | 2;
    buy: Currency;
    sell: Currency;
    time: number | null;
}

export class Entry {
    sku: string;

    name: string;

    enabled: boolean;

    autoprice: boolean;

    max: number;

    min: number;

    intent: 0 | 1 | 2;

    buy: Currencies;

    sell: Currencies;

    time: number | null;

    constructor(entry: EntryData, schema: SchemaManager.Schema) {
        this.sku = entry.sku;
        this.name = schema.getName(SKU.fromString(entry.sku), false);
        this.enabled = entry.enabled;
        this.autoprice = entry.autoprice;
        this.max = entry.max;
        this.min = entry.min;
        this.intent = entry.intent;
        this.buy = new Currencies(entry.buy);
        this.sell = new Currencies(entry.sell);
        this.time = entry.time;
    }

    getJSON(): EntryData {
        return {
            sku: this.sku,
            enabled: this.enabled,
            autoprice: this.autoprice,
            max: this.max,
            min: this.min,
            intent: this.intent,
            buy: this.buy,
            sell: this.sell,
            time: this.time
        };
    }
}

export default class Pricelist extends EventEmitter {
    private readonly schema: SchemaManager.Schema;

    private readonly socket: SocketIOClient.Socket;

    private prices: Entry[];

    private keyPrices: { buy: Currencies; sell: Currencies };

    constructor(schema: SchemaManager.Schema, socket: SocketIOClient.Socket) {
        super();
        this.schema = schema;
        this.socket = socket;
        this.prices = [];

        this.socket.removeListener('price', this.handlePriceChange.bind(this));
        this.socket.on('price', this.handlePriceChange.bind(this));
    }

    getKeyPrices(): { buy: Currencies; sell: Currencies } {
        return this.keyPrices;
    }

    getKeyPrice(): Currencies {
        return this.keyPrices.sell;
    }

    getLength(): number {
        return this.prices.length;
    }

    getPrices(): Entry[] {
        return [].concat(this.prices);
    }

    getPrice(sku: string, onlyEnabled = false): Entry | null {
        // Index of of item in pricelist
        const index = this.getIndex(sku);

        if (index === -1) {
            // Did not find a match
            return null;
        }

        const match = this.prices[index];

        if (onlyEnabled && !match.enabled) {
            // Item is not enabled
            return null;
        }

        return match;
    }

    searchByName(search: string, enabledOnly = true): Entry | string[] | null {
        search = search.toLowerCase();

        const match = [];

        for (let i = 0; i < this.prices.length; i++) {
            const entry = this.prices[i];

            if (enabledOnly && entry.enabled === false) {
                continue;
            }

            const name = entry.name.toLowerCase();

            if (search.includes('uncraftable')) {
                search = search.replace('uncraftable', 'non-craftable');
            }

            if (search === name) {
                // Found direct match
                return entry;
            }

            if (name.includes(search)) {
                match.push(entry);
            }
        }

        if (match.length === 0) {
            // No match
            return null;
        } else if (match.length === 1) {
            // Found one that matched the search
            return match[0];
        }

        // Found many that matched, return list of the names
        return match.map(entry => entry.name);
    }

    async addPrice(entry: Entry, emitChange: boolean): Promise<Entry> {
        if (entry.autoprice) {
            const price = await getPrice(entry.sku, 'bptf');

            entry.buy = new Currencies(price.buy);
            entry.sell = new Currencies(price.sell);
            entry.time = price.time;
        }

        const keyPrice = this.getKeyPrice();

        if (entry.buy.toValue(keyPrice.metal) >= entry.sell.toValue(keyPrice.metal)) {
            throw new Error('Sell must be higher than buy');
        }

        // Remove old price
        this.removePrice(entry.sku, false);

        // Add new price
        this.prices.push(entry);

        if (emitChange) {
            this.emit('price', entry.sku, entry);
        }

        return entry;
    }

    removePrice(sku: string, emitChange: boolean): void {
        const index = this.getIndex(sku);

        if (index !== -1) {
            // Found match, remove it
            this.prices.splice(index, 1);

            if (emitChange) {
                this.emit('price', sku, null);
            }
        }
    }

    private getIndex(sku: string): number {
        // Get name of item
        const name = this.schema.getName(SKU.fromString(sku), false);

        return this.prices.findIndex(entry => entry.name === name);
    }

    setPricelist(prices: EntryData[]): Promise<void> {
        // @ts-ignore
        this.prices = prices.map(entry => new Entry(entry, this.schema));

        log.debug('Getting key price...');
        return getPrice('5021;6', 'bptf')
            .then(keyPrices => {
                log.debug('Got key price');

                this.keyPrices = {
                    buy: new Currencies(keyPrices.buy),
                    sell: new Currencies(keyPrices.sell)
                };

                const entryKey = this.getPrice('5021;6');

                if (entryKey !== undefined && entryKey.autoprice) {
                    // The price of a key in the pricelist can be different from keyPrices because the pricelist is not updated
                    entryKey.buy = new Currencies(keyPrices.buy);
                    entryKey.sell = new Currencies(keyPrices.sell);
                    entryKey.time = keyPrices.time;
                }

                const old = this.getOld();

                if (old.length === 0) {
                    return;
                }

                log.debug('Getting pricelist...');

                return Promise.all([getPricelist('bptf'), old]);
            })
            .then(([pricelist, old]) => {
                log.debug('Got pricelist');

                const groupedPrices = Pricelist.groupPrices(pricelist.items as any[]);

                let pricesChanged = false;

                // Go through our pricelist
                for (let i = 0; i < old.length; i++) {
                    const currPrice = old[i];
                    if (currPrice.autoprice !== true) {
                        continue;
                    }

                    const item = SKU.fromString(currPrice.sku);
                    const name = this.schema.getName(item, false);

                    // Go through pricestf prices
                    for (let j = 0; j < groupedPrices[item.quality][item.killstreak].length; j++) {
                        const newestPrice = groupedPrices[item.quality][item.killstreak][j];

                        if (name === newestPrice.name) {
                            // Found matching items
                            if (currPrice.time < newestPrice.time) {
                                // Times don't match, update our price
                                currPrice.buy = new Currencies(newestPrice.buy);
                                currPrice.sell = new Currencies(newestPrice.sell);
                                currPrice.time = newestPrice.time;

                                pricesChanged = true;
                            }

                            // When a match is found remove it from the ptf pricelist
                            groupedPrices[item.quality][item.killstreak].splice(j, 1);
                            break;
                        }
                    }
                }

                if (pricesChanged) {
                    this.emit('pricelist', this.prices);
                }

                return;
            });
    }

    private handlePriceChange(data: any): void {
        if (data.soure !== 'bptf') {
            return;
        }

        if (data.sku === '5021;6') {
            this.keyPrices = {
                buy: new Currencies(data.buy),
                sell: new Currencies(data.sell)
            };
        }

        const match = this.getPrice(data.sku);
        if (match !== null && match.autoprice) {
            match.buy = new Currencies(data.buy);
            match.sell = new Currencies(data.sell);
            match.time = data.time;
            this.priceChanged(match);
        }
    }

    private priceChanged(entry: Entry): void {
        this.emit('price', entry);
        this.emit('pricelist', this.prices);
    }

    private getOld(): Entry[] {
        if (maxAge <= 0) {
            return this.prices;
        }

        const now = moment().unix();

        return this.prices.filter(entry => entry.time + maxAge <= now);
    }

    static groupPrices(prices: any[]): UnknownDictionary<UnknownDictionary<any[]>> {
        const sorted: UnknownDictionary<UnknownDictionary<any[]>> = {};

        for (let i = 0; i < prices.length; i++) {
            if (prices[i].buy === null) {
                continue;
            }

            const item = SKU.fromString(prices[i].sku);

            if (!sorted[item.quality]) {
                // Group is not defined yet
                sorted[item.quality] = {};
            }

            if (sorted[item.quality][item.killstreak] !== undefined) {
                sorted[item.quality][item.killstreak].push(prices[i]);
            } else {
                sorted[item.quality][item.killstreak] = [prices[i]];
            }
        }

        return sorted;
    }
}
