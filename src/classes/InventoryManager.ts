import Inventory from './Inventory';
import Pricelist from './Pricelist';
import SteamID from 'steamid';

export = InventoryManager;

class InventoryManager {
    private inventory: Inventory;
    private pricelist: Pricelist;

    constructor (botSteamID: SteamID, pricelist: Pricelist) {
        this.inventory = new Inventory(botSteamID);
        this.pricelist = pricelist;
    }

    isOverstocked (sku: string, buying: boolean, diff: number): boolean {
        return this.amountCanTrade(sku, buying) + (buying ? -diff : diff) < 0;
    }

    amountCanTrade (sku: string, buying: boolean): number {
        // Amount in inventory
        const amount = this.inventory.getAmount(sku, true);

        // Pricelist entry
        const match = this.pricelist.getPrice(sku, true);

        if (match === null) {
            // No price for item
            return 0;
        }

        if (buying && match.max === -1) {
            // We are buying, and we don't have a limit
            return Infinity;
        }

        let canTrade = match[buying ? 'max' : 'min'] - amount;
        if (!buying) {
            canTrade *= -1;
        }

        if (canTrade > 0) {
            // We can buy / sell the item
            return canTrade;
        }

        return 0;
    }
}
