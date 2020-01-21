declare module 'steamid' {
    export = SteamID;

    class SteamID {
        constructor (input: string);

        universe: number;
        type: number;
        instance: number;
        accountid: number;

        /**
         * Check whether this SteamID is valid (according to Steam's rules)
         * @return {boolean}
         */
        isValid(): boolean;

        /**
         * Render this SteamID into 64-bit numeric format
         * @return {string}
         */
        getSteamID64 (): string;
    }
}
