const prices = require('../../prices');

module.exports = function () {
    // @ts-ignore
    return prices.get(this.getSKU());
};
