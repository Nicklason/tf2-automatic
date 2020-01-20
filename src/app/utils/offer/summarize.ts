import Currencies from 'tf2-currencies';
import SKU from 'tf2-sku';

import schemaManager from '../../../lib/tf2-schema';

export default function () {
    // @ts-ignore
    const value = this.data('value');
    // @ts-ignore
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
