declare module 'steamid' {
    export = SteamID;

    class SteamID {
        constructor (input: string);

        universe: number;
        type: number;
        instance: number;
        accountid: number;

        isValid(): boolean;
        getSteamID64 (): string;
        toString (): string;
    }
}
