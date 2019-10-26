const SKU = require('tf2-sku');

module.exports = function () {
    return SKU.fromObject(this.getItem());
};
