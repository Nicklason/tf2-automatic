const inventory = require('app/inventory');

module.exports = function () {
    return inventory.isOverstocked(this.getSKU());
};
