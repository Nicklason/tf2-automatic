declare module 'steam-totp' {
    export function getAuthCode (secret: string, timeOffset?: number, callback?: (err: Error|null, code?: string, offset?: number, latency?: number) => void): string|undefined;
    export function generateAuthCode (secret: string, timeOffset?: number, callback?: (err: Error|null, code?: string, offset?: number, latency?: number) => void): string|undefined;
    export function getConfirmationKey (identitySecret: string, time: number, tag: string): string;
    export function generateConfirmationKey (identitySecret: string, time: number, tag: string): string;
    export function getTimeOffset (callback: (err: Error|null, offset?: number, latency?: number) => void): void;
    export function time (timeOffset?: number): number;
}
