import { TradeOffer } from 'steam-tradeoffer-manager';
import { Currency } from '../../../types/TeamFortress2';
import { UnknownDictionary } from '../../../types/common';

import Currencies from 'tf2-currencies';
import SKU from 'tf2-sku';

const schemaManager = require('../../../lib/tf2-schema');

export = function (): string {
    // @ts-ignore
    const self = <EconItem>this;

    const value: { our: Currency, their: Currency } = self.data('value');

    const items: { our: UnknownDictionary<number>, their: UnknownDictionary<number> } = self.data('dict') || { our: null, their: null };

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
