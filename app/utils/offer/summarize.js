const Currencies = require('tf2-currencies');
const prices = require('app/prices');
const SKU = require('tf2-sku');

const schemaManager = require('lib/tf2-schema');

module.exports = function () {
    const value = this.data('value');

    const ourCurrencies = !value ? 'unknown currencies' : new Currencies(value.our).toString();
    const theirCurrencies = !value ? 'unknown currencies' : new Currencies(value.their).toString();
    const keyPrices = prices.getKeyPrices()

    const items = this.data('dict') || { our: null, their: null };

    return 'Asked: ' + ourCurrencies + ' (' + summarizeItems(items.our) + ')\nOffered: ' + theirCurrencies + ' (' + summarizeItems(items.their) + ')\nCurrent key buy/sell price: ' + (keyPrices.buy.metal) + '/' + (keyPrices.sell.metal) + '.';
};

function summarizeItems (dict) {
    if (dict === null) {
        return 'unknown items';
    }

    const summary = [];

    for (const sku in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
            continue;
        }

        const amount = dict[sku];
        const name = schemaManager.schema.getName(SKU.fromString(sku));

        summary.push(name + (amount > 1 ? ' x' + amount : ''));
    }

    return summary.join(', ');
}
