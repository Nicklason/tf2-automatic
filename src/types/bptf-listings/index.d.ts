declare module 'bptf-listings' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from "events";
    import SchemaManager from "tf2-schema"
    import SteamID from "steamid";

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

        /**
         * Creates a new instance of ListingManager
         * @param options
         */
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
        init (callback: Function);

        /**
         * Sends a heartbeat to backpack.tf
         * @param callback 
         */
        sendHeartbeat (callback: Function);

        /**
         * Gets listings currently on backpack.tf
         * @param callback 
         */
        getListings (callback: Function);

        /**
         * Finds a listing from the cached listings
         * @param search 
         */
        findListing (search: string|number): ListingManager.Listing|null;

        findListings (sku: string): ListingManager.Listing[];

        createListings (listings);
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

        interface RawListing {
            id: string;
            item: object;
            appid: number;
            currencies: {
                keys: number,
                metal: number
            };
            offers: boolean;
            buyout: boolean;
            details: string;
            created: number;
            bump: number;
            intent: number;
            automatic?: number;
            count?: number;
            promoted?: number;
        }
        
        interface CreateListing {
            id?: number;
            sku?: string;
            intent: number;
            details?: string;
            time: number;
        }
    
        export class Listing {
            constructor (listing: RawListing, manager: ListingManager);

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
            update (properties: { currencies?: { keys: number, metal: number }, details?: string, offers?: boolean, buyout?: boolean });

            /**
             * Remove this listing
             */
            remove ();

            /**
             * Create a listing
             * @param listing 
             */
            createListing (listing: CreateListing);

            /**
             * Create many listings
             * @param listings 
             */
            createListings (listings: CreateListing[]);

            /**
             * Remove a listing
             * @param listingId 
             */
            removeListing (listingId: string);

            /**
             * Remove many listings
             * @param listingIds 
             */
            removeListings (listingIds: string[]);

            /**
             * Resets values to default
             */
            shutdown ();
        }
    }
}