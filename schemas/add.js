module.exports = {
    id: 'add',
    type: 'object',
    properties: {
        sku: {
            // sku of the item
            type: 'string'
        },
        intent: {
            // 0 = buy, 1 = sell, 2 = bank
            type: 'integer'
        },
        autoprice: {
            // if the item is autopriced or not
            type: 'boolean'
        },
        max_stock: {
            // maximum stock
            type: 'integer',
            // -1 is infinite
            minimum: -1
        },
        min_stock: {
            // minimum stock
            type: 'integer',
            minimum: 0
        },
        buy: {
            // buy price
            $ref: 'currencies'
        },
        sell: {
            // sell price
            $ref: 'currencies'
        }
    },
    additionalProperties: false,
    required: ['sku', 'autoprice', 'max_stock', 'min_stock']
};
