import { EconItem } from 'steam-tradeoffer-manager';

import prices from '../../prices';

export = function (): string {
    // @ts-ignore
    const self = <EconItem>this;

    return prices.get(self.getSKU());
};
