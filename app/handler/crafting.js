const inventory = require('app/inventory');
const crafting = require('app/crafting');

const minimumScrap = process.env.MINIMUM_SCRAP ? parseInt(process.env.MINIMUM_SCRAP) : 6;
const minimumReclaimed = process.env.MINIMUM_RECLAIMED ? parseInt(process.env.MINIMUM_RECLAIMED) : 6;

exports.keepMetalSupply = function () {
    const dict = inventory.getOwnInventory();
    const currencies = inventory.getCurrencies(dict);

    const smeltReclaimed = currencies.scrap >= minimumScrap ? 0 : Math.ceil((minimumScrap - currencies.scrap) / 3);
    let smeltRefined = currencies.reclaimed >= minimumReclaimed ? 0 : Math.ceil((minimumReclaimed - currencies.reclaimed) / 3);

    if (smeltReclaimed > 0) {
        smeltRefined += Math.ceil(smeltReclaimed / 3);
    }

    // TODO: When smelting metal mark the item as being used, then we won't use it when sending offers

    if (smeltRefined > 0) {
        crafting.smeltMetal(5002, smeltRefined);
    }
    if (smeltReclaimed > 0) {
        crafting.smeltMetal(5001, smeltReclaimed);
    }
};
