const SKU = require('tf2-sku');

module.exports = function () {
    const item = this.getItem();

    if (item === null) {
        return 'unknown';
    }

    return SKU.fromObject(item);
};
