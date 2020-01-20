/// <reference path="./Listenable.d.ts" />

declare class MissingSteamUser {
    steamID: any;
    limitations: any;
    EResult: any;

    myGroups: any[];
    myFriends: any[];
    users: any[];
    _playingAppIds: any[];

    autoRelogin: boolean;

    respondToGroupInvite: Function;
    inviteUserToGroup: Function;
    addFriend: Function;
    removeFriend: Function;
    gamesPlayed: Function;
    logOn: Function;
    logOff: Function;
    setPersona: Function;
}

type TypedSteamUser = MissingSteamUser & Listenable;