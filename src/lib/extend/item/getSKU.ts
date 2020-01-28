import { EconItem } from 'steam-tradeoffer-manager';

import SKU from 'tf2-sku';

export = function (): string {
    // @ts-ignore
    const self = <EconItem>this;

    const item = self.getItem();

    if (item === null) {
        throw new Error('Unknown sku for item "' + item.market_hash_name + '"');
    }

    return SKU.fromObject(item);
};
