import { Currency as TF2Currency } from '../../../types/TeamFortress2';
import { UnknownDictionary } from '../../../types/common';

import Currencies from 'tf2-currencies';
import SKU from 'tf2-sku';

const schemaManager = require('../../../lib/tf2-schema');

export = function (): string {
    // Cast "this" as a TradeOffer?

    // @ts-ignore
    const value: { our: TF2Currency, their: TF2Currency } = this.data('value');
    // @ts-ignore
    const items: { our: UnknownDictionary<number>, their: UnknownDictionary<number> } = this.data('dict') || { our: null, their: null };

    if (!value) {
        return 'Asked: ' + summarizeItems(items.our) + '\nOffered: ' + summarizeItems(items.their);
    } else {
        return 'Asked: ' + new Currencies(value.our).toString() + ' (' + summarizeItems(items.our) + ')\nOffered: ' + new Currencies(value.their).toString() + ' (' + summarizeItems(items.their) + ')';
    }
};

function summarizeItems (dict: UnknownDictionary<number>): string {
    if (dict === null) {
        return 'unknown items';
    }

    const summary: string[] = [];

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
