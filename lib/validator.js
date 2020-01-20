const jsonschema = require('jsonschema');
const Validator = jsonschema.Validator;

const v = new Validator();

v.addSchema(require('../schemas/currencies'));
v.addSchema(require('../schemas/pricelist'));
v.addSchema(require('../schemas/add'));

module.exports = function (...args) {
    const validated = v.validate(...args);
    if (validated.valid === true) {
        return null;
    }

    const errors = errorParser(validated);
    return errors;
};

function errorParser (validated) {
    const errors = [];
    for (let i = 0; i < validated.errors.length; i++) {
        const error = validated.errors[i];
        let property = error.property;
        if (property.startsWith('instance.')) {
            property = property.replace('instance.', '');
        } else if (property === 'instance') {
            property = '';
        }

        let message = error.stack;
        if (error.name === 'additionalProperties') {
            message = `unknown property "${error.argument}"`;
        } else if (property) {
            if (error.name === 'anyOf') {
                message = `"${property}" does not have a valid value`;
            } else {
                message = message.replace(error.property, `"${property}"`).trim();
            }
        } else {
            message = message.replace(error.property, property).trim();
        }

        errors.push(message);
    }
    return errors;
}

