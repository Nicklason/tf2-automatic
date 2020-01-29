export function exponentialBackoff(n: number, base = 1000): number {
    return Math.pow(2, n) * base + Math.floor(Math.random() * base);
}

export function parseJSON(json: string): object {
    try {
        return JSON.parse(json);
    } catch (err) {
        return null;
    }
}
