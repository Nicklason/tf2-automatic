import { UnknownDictionary } from '../types/common';
import SteamID from 'steamid';
import SteamTradeOfferManager, { EconItem } from 'steam-tradeoffer-manager';
import SchemaManager from 'tf2-schema';

export = class Inventory {
    private readonly steamID: SteamID;

    private readonly manager: SteamTradeOfferManager;

    private readonly schema: SchemaManager.Schema;

    private tradable: UnknownDictionary<string[]>;

    private nonTradable: UnknownDictionary<string[]>;

    constructor(steamID: SteamID | string, manager: SteamTradeOfferManager, schema: SchemaManager.Schema) {
        this.steamID = new SteamID(steamID.toString());
        this.manager = manager;
        this.schema = schema;
    }

    getSteamID(): SteamID {
        return this.steamID;
    }

    addItem(sku: string, assetid: string): void {
        const items = this.tradable;
        (items[sku] = items[sku] || []).push(assetid);
    }

    removeItem(assetid: string): void;

    removeItem(item: EconItem): void;

    removeItem(...args: any[]): void {
        const assetid = typeof args[0] === 'string' ? args[0] : args[0].id;

        const items = this.tradable;

        for (const sku in items) {
            if (Object.prototype.hasOwnProperty.call(items, sku)) {
                const assetids = items[sku];

                const index = assetids[sku].indexOf(assetid);

                if (index !== -1) {
                    assetids.splice(index, 1);
                    if (assetids.length === 0) {
                        delete items[sku];
                    }
                    break;
                }
            }
        }
    }

    fetch(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.manager.getUserInventoryContents(this.getSteamID(), 440, '2', false, (err, items) => {
                if (err) {
                    return reject(err);
                }

                const tradable: EconItem[] = [];
                const nonTradable: EconItem[] = [];

                items.forEach(function(item) {
                    if (item.tradable) {
                        tradable.push(item);
                    } else {
                        nonTradable.push(item);
                    }
                });

                this.tradable = Inventory.createDictionary(tradable, this.schema);
                this.nonTradable = Inventory.createDictionary(nonTradable, this.schema);

                resolve();
            });
        });
    }

    findBySKU(sku: string, tradableOnly = true): string[] {
        const tradable = this.tradable[sku] || [];

        if (tradableOnly) {
            return tradable;
        }

        const nonTradable = this.nonTradable[sku] || [];

        return tradable.concat(nonTradable);
    }

    getAmount(sku: string, tradableOnly?: boolean): number {
        return this.findBySKU(sku, tradableOnly).length;
    }

    getCurrencies(): {
        '5021;6': string[];
        '5002;6': string[];
        '5001;6': string[];
        '5000;6': string[];
    } {
        return {
            '5021;6': this.findBySKU('5021;6'),
            '5002;6': this.findBySKU('5002;6'),
            '5001;6': this.findBySKU('5001;6'),
            '5000;6': this.findBySKU('5000;6')
        };
    }

    private static createDictionary(items: EconItem[], schema: SchemaManager.Schema): UnknownDictionary<string[]> {
        const dict: UnknownDictionary<string[]> = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const sku = item.getSKU(schema);
            (dict[sku] = dict[sku] || []).push(item.id);
        }

        return dict;
    }
};
