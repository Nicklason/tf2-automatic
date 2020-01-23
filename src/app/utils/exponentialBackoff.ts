export = function (n: number, base: number = 1000): number {
    return (Math.pow(2, n) * base) + Math.floor(Math.random() * base);
};
