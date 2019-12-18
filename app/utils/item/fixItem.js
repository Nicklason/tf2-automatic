const isObject = require('isobject');

const schemaManager = require('lib/tf2-schema');

module.exports = function (item) {
    // Ignore paint and craftnumber
    item.paint = null;
    item.craftnumber = null;

    // Search the schema for the item
    const schemaItem = schemaManager.schema.getItemByDefindex(item.defindex);

    if (schemaItem === null) {
        return item;
    }

    // We want to use the upgradeable one if this is the case
    if (schemaItem.name.indexOf(schemaItem.item_class.toUpperCase()) !== -1) {
        for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
            // If the item classes match, but the name starts with Upgradeable, then we found the right item
            if (schemaManager.schema.raw.schema.items[i].item_class === schemaItem.item_class && schemaManager.schema.raw.schema.items[i].name.startsWith('Upgradeable ')) {
                item.defindex = schemaManager.schema.raw.schema.items[i].defindex;
            }
        }
    }

    // Fix problem with keys
    if (schemaItem.item_name === 'Mann Co. Supply Crate Key') {
        // Always use the normal Mann Co. Supply Crate Key defindex
        item.defindex = 5021;
    } else if (schemaItem.item_name === 'Lugermorph') {
        // Use right Lugermorph defindex
        item.defindex = 160;
    }

    // Fix problem with promo items. Promo items can only be genuine. If the quality is 1, then we need to choose the promo item

    // If the name starts with "Promo ", and it has no craft class, then it is a promo item
    const isPromoItem = isPromo(schemaItem);

    if (isPromoItem && item.quality != 1) {
        // Find non-promo
        for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
            if (!isPromo(schemaManager.schema.raw.schema.items[i]) && schemaManager.schema.raw.schema.items[i].item_name == schemaItem.item_name) {
                // This is the non-promo version, use that defindex instead
                item.defindex = schemaManager.schema.raw.schema.items[i].defindex;
            }
        }
    } else if (!isPromoItem && item.quality == 1) {
        // Check if the item should be a promo item
        for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
            // Check if the names are the same, but this is the promo version
            if (isPromo(schemaManager.schema.raw.schema.items[i]) && schemaManager.schema.raw.schema.items[i].item_name == schemaItem.item_name) {
                // This is the promo version, use that defindex instead
                item.defindex = schemaManager.schema.raw.schema.items[i].defindex;
            }
        }
    }

    if (schemaItem.item_class === 'supply_crate') {
        // The item is a case / crate, search for crate series

        let series = null;

        if (schemaItem.attributes !== undefined) {
            for (let i = 0; i < schemaItem.attributes.length; i++) {
                const attribute = schemaItem.attributes[i];

                if (attribute.name === 'set supply crate series') {
                    series = attribute.value;
                }
            }
        }

        if (series === null) {
            // Find item in items_game

            const itemsGameItem = schemaManager.schema.raw.items_game.items[item.defindex];

            if (itemsGameItem.static_attrs !== undefined && itemsGameItem.static_attrs['set supply crate series'] !== undefined) {
                if (isObject(itemsGameItem.static_attrs['set supply crate series'])) {
                    series = itemsGameItem.static_attrs['set supply crate series'].value;
                } else {
                    series = itemsGameItem.static_attrs['set supply crate series'];
                }
            }
        }

        if (series !== null) {
            item.crateseries = parseInt(series);
        }
    }

    if (item.effect !== null) {
        // Fix qualities for unusuals and skins
        if (item.quality === 11) {
            item.quality2 = 11;
        }

        item.quality = 5;
    } else if (item.paintkit !== null) {
        if (item.quality2 === 11) {
            item.quality = 11;
            item.quality2 = null;
        }
    }

    if (item.paintkit !== null) {
        const hasCorrectPaintkitAttribute = schemaManager.schema.raw.items_game.items[item.defindex].static_attrs !== undefined && schemaManager.schema.raw.items_game.items[item.defindex].static_attrs['paintkit_proto_def_index'] == item.paintkit;

        if (schemaItem.item_quality != 15 || !hasCorrectPaintkitAttribute) {
            // Item has skin but defindex is bad
            for (const defindex in schemaManager.schema.raw.items_game.items) {
                if (!Object.prototype.hasOwnProperty.call(schemaManager.schema.raw.items_game.items, defindex)) {
                    continue;
                }

                const itemsGameItem = schemaManager.schema.raw.items_game.items[defindex];
                if (itemsGameItem.prefab === undefined || !itemsGameItem.prefab.startsWith('paintkit')) {
                    continue;
                }

                if (itemsGameItem.static_attrs['paintkit_proto_def_index'] == item.paintkit) {
                    item.defindex = parseInt(defindex);
                    break;
                }
            }
        }
    }

    return item;
};

function isPromo (schemaItem) {
    return schemaItem.name.startsWith('Promo ') && schemaItem.craft_class == '';
}
