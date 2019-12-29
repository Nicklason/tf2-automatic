module.exports = function (n, base = 1000) {
    return (Math.pow(2, n) * base) + Math.floor(Math.random() * base);
};
