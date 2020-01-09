const schemaManager = require('lib/tf2-schema');

module.exports = function (name) {
    const match = [];

    const originalSchemaItem = schemaManager.schema.getItemByItemName(name);

    if (originalSchemaItem === null) {
        return match;
    }

    match.push(originalSchemaItem);

    for (let i = 0; i < schemaManager.schema.raw.schema.items.length; i++) {
        const schemaItem = schemaManager.schema.raw.schema.items[i];

        if (schemaItem.defindex === originalSchemaItem.defindex) {
            continue;
        }

        if (schemaItem.item_name === name) {
            match.push(schemaItem);
        }
    }

    return match;
};

