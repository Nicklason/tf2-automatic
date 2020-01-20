// @ts-check

module.exports = {
    id: 'currencies',
    type: 'object',
    properties: {
        keys: {
            type: 'number',
            minimum: 0
        },
        metal: {
            type: 'number',
            minimum: 0
        }
    },
    additionalProperties: false,
    required: ['keys', 'metal']
};
