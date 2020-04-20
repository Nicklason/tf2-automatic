export = {
    id: 'pricelist',
    type: 'object',
    properties: {
        sku: {
            // sku of the item
            type: 'string'
        },
        name: {
            // name of the item (used for compatibility with v2)
            type: 'string'
        },
        enabled: {
            // if we are actually trading the item
            type: 'boolean'
        },
        intent: {
            // 0 = buy, 1 = sell, 2 = bank
            type: 'integer',
            minimum: 0,
            maximum: 2
        },
        autoprice: {
            // if the item is autopriced or not
            type: 'boolean'
        },
        undercutting: {
            // if they want to enable undercutting or not
            type: 'boolean'
        },
        max: {
            // maximum stock
            type: 'integer',
            // -1 is infinite
            minimum: -1
        },
        min: {
            // minimum stock
            type: 'integer',
            minimum: 0
        },
        buy: {
            // buy price
            $ref: 'tf2-currencies'
        },
        sell: {
            // sell price
            $ref: 'tf2-currencies'
        },
        lastBuy: {
            // last buy price
            anyOf: [
                {
                    $ref: 'tf2-currencies'
                },
                {
                    type: 'null'
                }
            ]
        },
        lastSell: {
            // last sell price
            anyOf: [
                {
                    $ref: 'tf2-currencies'
                },
                {
                    type: 'null'
                }
            ]
        },
        time: {
            // time when the price changed
            anyOf: [
                {
                    type: 'number'
                },
                {
                    type: 'null'
                }
            ]
        }
    },
    additionalProperties: true,
    required: ['sku', 'enabled', 'intent', 'autoprice', 'max', 'min', 'buy', 'sell', 'time']
};
