const prices = require('app/prices');

module.exports = function () {
    return prices.get(this.getSKU());
};
