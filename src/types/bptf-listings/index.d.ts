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

        /**
         * Initializes ListingManager
         * @param callback
         */
        init (callback: Function): void;

        /**
         * Sends a heartbeat to backpack.tf
         * @param callback 
         */
        sendHeartbeat (callback: Function): void;

        /**
         * Gets listings currently on backpack.tf
         * @param callback 
         */
        getListings (callback: Function): void;

        /**
         * Finds a listing from the cached listings
         * @param search 
         */
        findListing (search: string|number): ListingManager.Listing|null;

        /**
         * Finds listings for matching item
         * @param sku 
         */
        findListings (sku: string): ListingManager.Listing[];

        /**
         * Create a listing
         * @param listing 
         */
        createListing (listing: ListingManager.CreateListing): void;

        /**
         * Create many listings
         * @param listings 
         */
        createListings (listings: ListingManager.CreateListing[]): void;

        /**
         * Remove a listing
         * @param listingId 
         */
        removeListing (listingId: string): void;

        /**
         * Remove many listings
         * @param listingIds 
         */
        removeListings (listingIds: string[]): void;

        /**
         * Resets values to default
         */
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

            /**
             * Get sku of the item
             */
            getSKU (): string;

            /**
             * Get item
             */
            getItem (): Item;

            /**
             * Get name of the item
             */
            getName (): string;

            /**
             * Update this listing
             * @param properties 
             */
            update (properties: { currencies?: { keys: number, metal: number }, details?: string, offers?: boolean, buyout?: boolean }): void;

            /**
             * Remove this listing
             */
            remove (): void;
        }
    }
}