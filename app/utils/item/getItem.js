const SKU = require('tf2-sku');
const url = require('url');

const schemaManager = require('lib/tf2-schema');

module.exports = function () {
    const item = {
        defindex: getDefindex(this),
        quality: getQuality(this),
        craftable: isCraftable(this),
        killstreak: getKillstreak(this),
        australium: isAustralium(this),
        festive: isFestive(this),
        effect: getEffect(this),
        wear: getWear(this),
        paintkit: getPaintKit(this)
    };

    // Adds missing properties
    return SKU.fromString(SKU.fromObject(item));
};

/**
 * Gets the defindex of an item
 * @param {Object} item
 * @return {Number}
 */
function getDefindex (item) {
    if (item.app_data !== undefined) {
        return parseInt(item.app_data.def_index, 10);
    }

    const link = item.getAction('Item Wiki Page...');

    if (link !== null) {
        return parseInt(url.parse(link, true).query.id, 10);
    }

    // Last option is to get the name of the item and try and get the defindex that way

    return null;
}

/**
 * Gets the quality of an item
 * @param {Object} item
 * @return {Number}
 */
function getQuality (item) {
    if (item.app_data !== undefined) {
        return parseInt(item.app_data.quality, 10);
    }

    const quality = item.getTag('Quality');
    if (quality !== null) {
        return schemaManager.schema.getQualityIdByName(quality);
    }

    return null;
}

/**
 * Determines if the item is craftable
 * @param {Object} item
 * @return {Boolean}
 */
function isCraftable (item) {
    return !item.hasDescription('( Not Usable in Crafting )');
}

/**
 * Gets the killstreak tier of an item
 * @param {Object} item
 * @return {Number}
 */
function getKillstreak (item) {
    const killstreaks = ['Professional ', 'Specialized ', ''];

    const index = killstreaks.findIndex((killstreak) => item.market_hash_name.indexOf(killstreak + 'Killstreak') !== -1);

    return index === -1 ? 0 : 3 - index;
}

/**
 * Determines if the item is australium
 * @param {Object} item
 * @return {Boolean}
 */
function isAustralium (item) {
    if (item.getTag('Quality') !== 'Strange') {
        return false;
    }

    return item.market_hash_name.indexOf('Australium ') !== -1;
}

/**
 * Determines if thje item is festivized
 * @param {Object} item
 * @return {Boolean}
 */
function isFestive (item) {
    return item.market_hash_name.indexOf('Festivized ') !== -1;
}

/**
 * Gets the effect of an item
 * @param {Object} item
 * @return {String}
 */
function getEffect (item) {
    if (getQuality(item) === 6) {
        return null;
    } else if (!Array.isArray(item.descriptions)) {
        return null;
    }

    const effect = item.descriptions.find((description) => description.value[0] === '\u2605');

    return effect === undefined ? null : schemaManager.schema.getEffectIdByName(effect.value.substring(18));
}

/**
 * Gets the wear of an item
 * @param {Object} item
 * @return {Number}
 */
function getWear (item) {
    const wear = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle Scarred'].findIndex((wear) => item.market_hash_name.indexOf(wear) !== -1);

    return wear === -1 ? null : wear + 1;
}

/**
 * Get skin from item
 * @param {Object} item
 * @return {Number}
 */
function getPaintKit (item) {
    if (getWear(item) === null) {
        return;
    }

    let hasCaseCollection = false;
    let skin = null;

    for (let i = 0; i < item.descriptions.length; i++) {
        const description = item.descriptions[i].value;

        if (!hasCaseCollection && description.endsWith('Collection')) {
            hasCaseCollection = true;
        } else if (hasCaseCollection && description.startsWith('✔')) {
            skin = description.replace('✔ ', '').replace(' War Paint', '');
            break;
        }
    }

    if (skin === null) {
        return null;
    }

    if (skin.indexOf('Mk.I') !== -1) {
        return schemaManager.schema.getSkinIdByName(skin);
    }

    const schemaItem = schemaManager.schema.getItemByDefindex(getDefindex(item));

    // Remove weapon from skin name
    skin = skin.replace(schemaItem.item_type_name, '').trim();

    return schemaManager.schema.getSkinIdByName(skin);
}
