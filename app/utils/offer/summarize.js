const Currencies = require('tf2-currencies');
const SKU = require('tf2-sku');

const schemaManager = require('lib/tf2-schema');

module.exports = function () {
    const value = this.data('value');

    const ourCurrencies = new Currencies(value.our);
    const theirCurrencies = new Currencies(value.their);

    const items = this.data('items');

    return 'Asked: ' + ourCurrencies.toString() + ' (' + summarizeItems(items.our) + ')\nOffered: ' + theirCurrencies.toString() + ' (' + summarizeItems(items.their) + ')';
};

function summarizeItems (dict) {
    const summary = [];

    for (const sku in dict) {
        if (!Object.prototype.hasOwnProperty.call(dict, sku)) {
            continue;
        }

        const amount = dict[sku].length;
        const name = schemaManager.schema.getName(SKU.fromString(sku));

        summary.push(name + (amount > 1 ? ' x' + amount : ''));
    }

    return summary.join(', ');
}
