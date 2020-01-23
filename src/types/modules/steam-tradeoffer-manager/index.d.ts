declare module 'steam-tradeoffer-manager' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from 'events';
    import SteamID from 'steamid';

    interface UnknownKeys<T> {
        [key: string]: T;
    }

    type PollData = {
        sent: UnknownKeys<number>,
        received: UnknownKeys<number>,
        timestamps: UnknownKeys<number>,
        offersSince: number,
        offerData: UnknownKeys<any>
    }

    interface Events {
        newOffer: (offer: SteamTradeOfferManager.TradeOffer) => void;
        receivedOfferChanged: (offer: SteamTradeOfferManager.TradeOffer, oldState: number) => void;
        sentOfferChanged: (offer: SteamTradeOfferManager.TradeOffer, oldState: number) => void;
        pollData: (pollData: PollData) => void;
        debug: (message: string) => void;
    }

    export = SteamTradeOfferManager;

    class SteamTradeOfferManager extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        constructor(options: any);

        steamID: SteamID|null;
        pollData: PollData;
        apiKey: string|null;
        pollInterval: number;

        createOffer(partner: SteamID|string, token?: string): SteamTradeOfferManager.TradeOffer;
        getInventoryContents(appid: any, contextid: any, tradableOnly: any, callback: any): void;
        getOffer(id: any, callback: any): void;
        getOfferToken(callback: any): void;
        getOffers(filter: any, historicalCutoff: any, callback: any): void;
        getUserInventoryContents(sid: any, appid: any, contextid: any, tradableOnly: any, callback: any): void;
        loadInventory(appid: any, contextid: any, tradableOnly: any, callback: any): void;
        loadUserInventory(sid: any, appid: any, contextid: any, tradableOnly: any, callback: any): void;
        setCookies(cookies: string[], familyViewPin?: string, callback?: (err: Error|null) => void): void;
        shutdown(): void;

        static EOfferFilter: any;
        static EResult: any;
        static ETradeOfferState: any;
    }

    namespace SteamTradeOfferManager {
        export class EconItem {
            appid: number;
            contextid: string;
            assetid: string;
            classid: string;
            instanceid: string;
            amount: string;
            pos: number;
            id: string;
            background_color: string;
            icon_url: string;
            icon_url_large: string;
            tradable: boolean;
            actions: [{
                link: string,
                name: string
            }];
            name: string;
            name_color: string;
            type: string;
            market_name: string;
            market_hash_name: string;
            commodity: boolean;
            market_tradable_restriction: number;
            market_marketable_restriction: number;
            marketable: boolean;
            tags: [{
                internal_name: string,
                category: string,
                name: string,
                localized_tag_name: string,
                color: string,
                category_name: string,
                localized_category_name: string
            }];
            is_currency: boolean;
            fraudwarnings: any[];
            descriptions: [{
                value: string,
                color?: string
            }];
            app_data: any;

            // Custom functions added to prototype
            hasDescription (description: string): boolean;
            getAction (action: string): string|null;
            // FIXME: Don't overwrite getTag prototype as it already exists
            getTag (category: string): string|null;
            getSKU (): string|null;
            // FIXME: Remove getItem function and add logic to getSKU
            getItem (): any|null;
            getName (): string|null;
            // Remove getPrice function as it is not used, will also make for weird types
            getPrice (): any|null;
        }

        type TradeOfferItem = {
            id?: string;
            assetid: string;
            appid: number;
            contextid: string;
            amount?: number
        };

        type UserDetails = {
            personaName: string,
            contexts: any,
            escrowDays: number,
            avatarIcon: string,
            avatarMedium: string,
            avatarFull: string
        };

        export class TradeOffer {
            partner: SteamID;
            id: number|null;
            message: string|null;
            state: number;
            itemsToGive: EconItem[];
            itemsToReceive: EconItem[];

            isGlitched (): boolean;
            data (key: string): any;
            data (key: string, value: any): void;
            addMyItem (item: TradeOfferItem): boolean;
            addMyItems (items: TradeOfferItem[]): number;
            addTheirItem (item: TradeOfferItem): boolean;
            addTheirItems (items: TradeOfferItem[]): number;
            setToken (token: string): void;
            setMessage (message: string): void;
            getUserDetails (callback: (err: Error|null, me?: UserDetails, them?: UserDetails) => void): void;
            accept (skipStateUpdate?: boolean, callback?: (err: Error|null, status?: string) => void): void;
            send (callback?: (err: Error|null, state?: string) => void): void;
            decline (callback?: (err: Error|null) => void): void;
            
            // Custom function added to prototype
            log (level: string, message: string);
        }
    }
}