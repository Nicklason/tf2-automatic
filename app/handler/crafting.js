//@ts-check

const inventory = require('../inventory');
const crafting = require('../crafting');

const minimumScrap = process.env.MINIMUM_SCRAP ? parseInt(process.env.MINIMUM_SCRAP) : 6;
const minimumReclaimed = process.env.MINIMUM_RECLAIMED ? parseInt(process.env.MINIMUM_RECLAIMED) : 6;

exports.keepMetalSupply = function () {
    const dict = inventory.getOwnInventory();
    const currencies = inventory.getCurrencies(dict, true);

    const smeltReclaimed = currencies['5000;6'] >= minimumScrap ? 0 : Math.ceil((minimumScrap - currencies['5000;6']) / 3);
    let smeltRefined = currencies['5001;6'] >= minimumReclaimed ? 0 : Math.ceil((minimumReclaimed - currencies['5001;6']) / 3);

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
