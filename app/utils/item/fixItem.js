const isObject = require('isobject');

const schemaManager = require('lib/tf2-schema');

module.exports = function (item) {
    const schemaItem = schemaManager.schema.getItemByDefindex(item.defindex);

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
        // Fix quality for items with effects
        if (item.quality === 11) {
            item.quality2 = 11;
        }

        item.quality = 5;
    } else if (item.paintkit !== null && item.quality2 === 11) {
        // Fix quality for skins without effect
        item.quality = 11;
        item.quality2 = null;
    }

    return item;
};
