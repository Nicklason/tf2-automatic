import { EconItem } from 'steam-tradeoffer-manager';

/**
 * Checks if an item has a specific description
 * @param description
 */
export = function (description: string): boolean {
    // @ts-ignore
    const self = <EconItem>this;

    if (!Array.isArray(self.descriptions)) {
        return false;
    }

    return self.descriptions.some(function (d) {
        return d.value === description;
    });
};
