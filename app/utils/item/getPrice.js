//@ts-check

const prices = require('../../prices');

module.exports = function () {
    return prices.get(this.getSKU());
};
