import Inventory from './Inventory';
import Pricelist from './Pricelist';

export = class InventoryManager {
    private inventory: Inventory = null;

    private readonly pricelist: Pricelist;

    constructor(pricelist: Pricelist, inventory?: Inventory) {
        if (inventory !== null) {
            this.inventory = inventory;
        }
        this.pricelist = pricelist;
    }

    setInventory(inventory: Inventory): void {
        this.inventory = inventory;
    }

    getInventory(): Inventory {
        return this.inventory;
    }

    isOverstocked(sku: string, buying: boolean, diff: number): boolean {
        return this.amountCanTrade(sku, buying) + (buying ? -diff : diff) < 0;
    }

    amountCanTrade(sku: string, buying: boolean): number {
        if (this.inventory === undefined) {
            throw new Error('Inventory has not been set yet');
        }

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

        if (match.intent !== 2 && match.intent !== (buying ? 0 : 1)) {
            // We are not buying / selling the item
            return 0;
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
};
