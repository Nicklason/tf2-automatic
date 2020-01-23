import { EconItem } from 'steam-tradeoffer-manager';
import { Item as TF2Item } from '../../../types/TeamFortress2';

import schemaManager from '../../../lib/tf2-schema';

export = function (): string {
    // @ts-ignore
    const self = <EconItem>this;

    const item = <TF2Item>self.getItem();

    if (item === null) {
        return null;
    }

    return schemaManager.schema.getName(item);
};
