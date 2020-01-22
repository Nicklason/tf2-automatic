declare module 'steamcommunity' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from 'events';
    import SteamID from 'steamid';
    import { CookieJar } from 'request';

    interface Events {
        sessionExpired: () => void;
        confKeyNeeded: (tag: string, callback: (err: Error|null, time: number, confKey: string) => void) => void;
    }

    export = SteamCommunity;

    class SteamCommunity extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        constructor (options?: object);

        steamID: SteamID|null;
        _jar: CookieJar;

        /* login (details: { accountName: string, password: string, steamguard?: string, authCode?: string, twoFactorCode?: string, captcha?: string, disableMobile?: boolean }, callback: Function): void;
        oAuthLogin (steamguard: string, oAuthToken: string, callback: Function): void;
        loggedIn (callback: Function): void;
        getSessionID (): string;
        getWebAPIKey (domain: string, callback: (err: Error|null, key?: string) => void); */
        setCookies (cookies: string): void;
        editProfile (settings: { name?: string, realName?: string, summary?: string, country?: string, state?: string, city?: string, customURL?: string, featuredBadge?: number, primaryGroup?: SteamID|string }, callback?: (err: Error|null) => void): void;
        profileSettings (settings: { profile?: number, comments?: number, inventory?: number, inventoryGifts?: boolean, gameDetails?: number, playTime?: boolean, friendsList?: number }, callback?: (err: Error|null) => void): void;
        uploadAvatar: (image: Buffer|string/* , format?: string */, callback?: (err: Error|null, url?: string) => void) => void;
        inviteUserToGroup: (userID: SteamID|string, groupID: SteamID|string, callback?: (err: Error|null) => void) => void;
        getSteamGroup: (id: SteamID|string, callback: (err: Error|null, group?: SteamCommunity.Group) => void) => void;
        getTradeURL (callback: (err: Error|null, url?: string, token?: string) => void): void;
        acceptConfirmationForObject: (identitySecret: string, objectID: number, callback: (err: Error|null) => void) => void;
    }

    namespace SteamCommunity {
        interface Group {
            steamID: SteamID;
            name: string;
            url: string;
            headline: string;
            summary: string;
            avatarHash: Buffer;
            members: number;
            membersInChat: number;
            membersInGame: number;
            membersOnline: number;

            join: (callback?: (err: Error|null) => void) => void;
        }
    }
}
