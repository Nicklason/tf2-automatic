declare module 'bptf-listings' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from 'events';
    import SchemaManager from 'tf2-schema';
    import SteamID from 'steamid';
    import TF2Currencies from 'tf2-currencies';

    interface Events {
        ready: () => void;
        listings: (listings: ListingManager.Listing[]) => void;
        actions: (actions: { create: object[], remove: string[] }) => void;
        heartbeat: (bumped: number) => void;
        inventory: (lastUpdated: number) => void;
    }

    export = ListingManager;

    class ListingManager extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        static EFailiureReason: object;

        constructor (options: { token?: string, steamid?: string, waitTime?: number, batchSize?: number, schema?: SchemaManager.Schema });

        token: string|undefined;
        steamid: SteamID;
        waitTime: number;
        batchSize: number;
        cap: number|null;
        promotes: number|null;
        listings: ListingManager.Listing[];
        actions: { create: object[], remove: string[] };
        ready: boolean;
        schema: SchemaManager.Schema|null;

        _timeout: ReturnType<typeof setTimeout>;
        _heartbeatInterval: ReturnType<typeof setInterval>;
        _inventoryInterval: ReturnType<typeof setInterval>;

        init (callback: Function): void;
        sendHeartbeat (callback: Function): void;
        getListings (callback: Function): void;
        findListing (search: string|number): ListingManager.Listing|null;
        findListings (sku: string): ListingManager.Listing[];
        createListing (listing: ListingManager.CreateListing): void;
        createListings (listings: ListingManager.CreateListing[]): void;
        removeListing (listingId: string): void;
        removeListings (listingIds: string[]): void;
        shutdown (): void;
    }

    namespace ListingManager {
        interface Item {
            defindex: number;
            quality: number;
            craftable:  boolean;
            tradable: boolean;
            killstreak: number;
            australium: boolean;
            festive: boolean;
            paintkit: string|null;
            wear: number|null;
            quality2: number|null;
            target: number|null;
            craftnumber: number|null;
            crateseries: number|null;
            output: number|null;
            outputQuality: number|null;
        }
        
        interface CreateListing {
            id?: number;
            sku?: string;
            intent: number;
            details?: string;
            time: number;
        }
    
        class Listing {
            id: string;
            steamid: SteamID;
            intent: number;
            item: object;
            appid: number;
            currencies: TF2Currencies;
            offers: boolean;
            buyout: boolean;
            details: string;
            created: number;
            bump: number;

            getSKU (): string;
            getItem (): Item;
            getName (): string;
            update (properties: { time: number, currencies?: { keys: number, metal: number }, details?: string, offers?: boolean, buyout?: boolean }): void;
            remove (): void;
        }
    }
}