declare module 'steam-user' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from 'events';
    import SteamID from 'steamid';

    interface Events {
        loggedOn: () => void;
        webSession: (sessionID: string, cookies: string) => void;
        accountLimitations: (limited: boolean, communityBanned: boolean, locked: boolean, canInviteFriends: boolean) => void;
        friendMessage: (senderID: SteamID, message: string) => void;
        friendRelationship: (steamID: SteamID, relationship: number) => void;
        groupRelationship: (groupID: SteamID, relationship: number) => void;
        steamGuard: (domain: string, callback: (authCode: string) => void, lastCodeWrong: boolean) => void;
        loginKey: (loginKey: string) => void;
        error: (err: Error) => void;
    }

    export = SteamUser;

    class SteamUser extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        static EResult: any;
        static EPersonaState: any;
        static EClanRelationship: any;
        static EFriendRelationship: any;

        steamID: SteamID|null;
        limitations: {
            limited: boolean,
            communityBanned: boolean,
            locked: boolean,
            canInviteFriends: boolean
        }|null;
        users: object|null;
        myGroups: object|null;
        myFriends: object|null;
        autoRelogin: boolean;
        _playingAppIds: number[];

        logOn(details: { accountName: string, password?: string, loginKey?: string, twoFactorCode?: string, rememberPassword?: boolean }): void;
        webLogOn(): void;
        setPersona(state: number, name?: string): void;
        gamesPlayed(apps: any[]|object|string|number, force?: boolean): void;
        chatMessage(recipient: SteamID|string, message: string): void;
        addFriend(steamID: SteamID|string, callback?: (err: Error|null, personaName?: string) => void): void;
        removeFriend(steamID: SteamID|string): void;
        respondToGroupInvite(groupSteamID: SteamID|string, accept: boolean): void;
        logOff(): void;
    }
}
