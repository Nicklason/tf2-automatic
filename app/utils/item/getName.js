// @ts-check

const schemaManager = require('../../../lib/tf2-schema');

module.exports = function () {
    const item = this.getItem();

    if (item === null) {
        return null;
    }

    return schemaManager.schema.getName(item);
};
