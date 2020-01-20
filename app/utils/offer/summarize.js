const Currencies = require('tf2-currencies');
const SKU = require('tf2-sku');

const schemaManager = require('lib/tf2-schema');

module.exports = function () {
    const value = this.data('value');
    const items = this.data('dict') || { our: null, their: null };

    if (!value) {
        return 'Asked: ' + summarizeItems(items.our) + '\nOffered: ' + summarizeItems(items.their);
    } else {
        return 'Asked: ' + new Currencies(value.our).toString() + ' (' + summarizeItems(items.our) + ')\nOffered: ' + new Currencies(value.their).toString() + ' (' + summarizeItems(items.their) + ')';
    }
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
