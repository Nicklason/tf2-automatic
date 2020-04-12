import { Currency } from '../types/TeamFortress2';
import { UnknownDictionary } from '../types/common';

import { EventEmitter } from 'events';
import moment from 'moment';
import Currencies from 'tf2-currencies';
import SKU from 'tf2-sku';
import SchemaManager from 'tf2-schema';

import log from '../lib/logger';
import { getPricelist, getPrice } from '../lib/ptf-api';
import validator from '../lib/validator';

const maxAge = parseInt(process.env.MAX_PRICE_AGE) || 8 * 60 * 60;

export interface EntryData {
    sku: string;
    enabled: boolean;
    autoprice: boolean;
    max: number;
    min: number;
    intent: 0 | 1 | 2;
    buy?: Currency | null;
    sell?: Currency | null;
    time?: number | null;
}

export class Entry {
    sku: string;

    name: string;

    enabled: boolean;

    autoprice: boolean;

    max: number;

    min: number;

    intent: 0 | 1 | 2;

    buy: Currencies | null;

    sell: Currencies | null;

    time: number | null;

    constructor(entry: EntryData, schema: SchemaManager.Schema) {
        this.sku = entry.sku;
        this.name = schema.getName(SKU.fromString(entry.sku), false);
        this.enabled = entry.enabled;
        this.autoprice = entry.autoprice;
        this.max = entry.max;
        this.min = entry.min;
        this.intent = entry.intent;

        // TODO: Validate entry

        if (entry.buy && entry.sell) {
            // Added both buy and sell
            this.buy = new Currencies(entry.buy);
            this.sell = new Currencies(entry.sell);

            this.time = this.autoprice ? entry.time : null;
        } else {
            // Price not set yet
            this.buy = null;
            this.sell = null;
            this.time = null;
        }
    }

    hasPrice(): boolean {
        // TODO: Allow null buy / sell price depending on intent
        return this.buy !== null && this.sell !== null;
    }

    getJSON(): EntryData {
        return {
            sku: this.sku,
            enabled: this.enabled,
            autoprice: this.autoprice,
            max: this.max,
            min: this.min,
            intent: this.intent,
            buy: this.buy === null ? null : this.buy.toJSON(),
            sell: this.sell === null ? null : this.sell.toJSON(),
            time: this.time
        };
    }
}

export default class Pricelist extends EventEmitter {
    private readonly schema: SchemaManager.Schema;

    private readonly socket: SocketIOClient.Socket;

    private prices: Entry[] = [];

    private keyPrices: { buy: Currencies; sell: Currencies };

    constructor(schema: SchemaManager.Schema, socket: SocketIOClient.Socket) {
        super();
        this.schema = schema;
        this.socket = socket;

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
        return this.prices.slice(0);
    }

    hasPrice(sku: string, onlyEnabled = false): boolean {
        const index = this.getIndex(sku);

        if (index === -1) {
            return false;
        }

        const match = this.prices[index];

        return !onlyEnabled || match.enabled;
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

        const match: Entry[] = [];

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

    private async validateEntry(entry: Entry): Promise<void> {
        if (entry.autoprice) {
            let price;

            try {
                price = await getPrice(entry.sku, 'bptf');
            } catch (err) {
                throw new Error(err.body && err.body.message ? err.body.message : err.message);
            }

            entry.buy = new Currencies(price.buy);
            entry.sell = new Currencies(price.sell);
            entry.time = price.time;
        }

        if (!entry.hasPrice()) {
            throw new Error('Pricelist entry does not have a price');
        }

        const keyPrice = this.getKeyPrice();

        if (entry.buy.toValue(keyPrice.metal) >= entry.sell.toValue(keyPrice.metal)) {
            throw new Error('Sell must be higher than buy');
        }
    }

    async addPrice(entryData: EntryData, emitChange: boolean): Promise<Entry> {
        const errors = validator(entryData, 'pricelist-add');

        if (errors !== null) {
            return Promise.reject(new Error(errors.join(', ')));
        }

        if (this.hasPrice(entryData.sku, false)) {
            throw new Error('Item is already priced');
        }

        const entry = new Entry(entryData, this.schema);

        await this.validateEntry(entry);

        // Add new price
        this.prices.push(entry);

        if (emitChange) {
            this.priceChanged(entry.sku, entry);
        }

        return entry;
    }

    async updatePrice(entryData: EntryData, emitChange: boolean): Promise<Entry> {
        const errors = validator(entryData, 'pricelist-add');

        if (errors !== null) {
            return Promise.reject(new Error(errors.join(', ')));
        }

        const entry = new Entry(entryData, this.schema);

        await this.validateEntry(entry);

        // Remove old price
        this.removePrice(entry.sku, false);

        // Add new price
        this.prices.push(entry);

        if (emitChange) {
            this.priceChanged(entry.sku, entry);
        }

        return entry;
    }

    removeAll(): Promise<any> {
        return new Promise(resolve => {
            if (this.getLength() !== 0) {
                this.prices = [];
                this.emit('pricelist', []);
            }

            return resolve();
        });
    }

    removePrice(sku: string, emitChange: boolean): Promise<Entry> {
        return new Promise((resolve, reject) => {
            const index = this.getIndex(sku);

            if (index === -1) {
                return reject(new Error('Item is not priced'));
            }

            // Found match, remove it
            const entry = this.prices.splice(index, 1)[0];

            if (emitChange) {
                this.priceChanged(sku, entry);
            }

            return resolve(entry);
        });
    }

    private getIndex(sku: string): number {
        // Get name of item
        const name = this.schema.getName(SKU.fromString(sku), false);

        return this.prices.findIndex(entry => entry.name === name);
    }

    setPricelist(prices: EntryData[]): Promise<void> {
        if (prices.length !== 0) {
            const errors = validator(
                {
                    sku: prices[0].sku,
                    enabled: prices[0].enabled,
                    intent: prices[0].intent,
                    max: prices[0].max,
                    min: prices[0].min,
                    autoprice: prices[0].autoprice,
                    buy: prices[0].buy,
                    sell: prices[0].sell,
                    time: prices[0].time
                },
                'pricelist'
            );

            if (errors !== null) {
                throw new Error(errors.join(', '));
            }
        }

        // @ts-ignore
        this.prices = prices.map(entry => new Entry(entry, this.schema));

        return this.setupPricelist();
    }

    setupPricelist(): Promise<void> {
        log.debug('Getting key price...');

        return getPrice('5021;6', 'bptf').then(keyPrices => {
            log.debug('Got key price');

            this.keyPrices = {
                buy: new Currencies(keyPrices.buy),
                sell: new Currencies(keyPrices.sell)
            };

            const entryKey = this.getPrice('5021;6');

            if (entryKey !== null && entryKey.autoprice) {
                // The price of a key in the pricelist can be different from keyPrices because the pricelist is not updated
                entryKey.buy = new Currencies(keyPrices.buy);
                entryKey.sell = new Currencies(keyPrices.sell);
                entryKey.time = keyPrices.time;
            }

            const old = this.getOld();

            if (old.length === 0) {
                return;
            }

            return this.updateOldPrices(old);
        });
    }

    private updateOldPrices(old: Entry[]): Promise<void> {
        log.debug('Getting pricelist...');

        return getPricelist('bptf').then(pricelist => {
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
        });
    }

    private handlePriceChange(data: any): void {
        if (data.source !== 'bptf') {
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
            this.priceChanged(match.sku, match);
        }
    }

    private priceChanged(sku: string, entry: Entry): void {
        this.emit('price', sku, entry);
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
