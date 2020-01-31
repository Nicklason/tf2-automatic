import dotProp from 'dot-prop';

import { UnknownDictionaryKnownValues } from '../types/common';
import { parseJSON } from '../lib/helpers';

export = class CommandParser {
    static getCommand(message: string): string | null {
        if (message.startsWith('!')) {
            return message
                .toLowerCase()
                .split(' ')[0]
                .substring(1);
        }

        return null;
    }

    static parseParams(paramString: string): UnknownDictionaryKnownValues {
        const params = parseJSON(
            '{"' +
                paramString
                    .replace(/"/g, '\\"')
                    .replace(/&/g, '","')
                    .replace(/=/g, '":"') +
                '"}'
        );

        const parsed = {};

        if (params !== null) {
            for (const key in params) {
                if (!Object.prototype.hasOwnProperty.call(params, key)) {
                    continue;
                }

                let value = params[key];

                if (key !== 'sku') {
                    const lowerCase = value.toLowerCase();
                    if (/^\d+$/.test(lowerCase)) {
                        value = parseInt(lowerCase);
                    } else if (/^\d+(\.\d+)?$/.test(lowerCase)) {
                        value = parseFloat(lowerCase);
                    } else if (lowerCase === 'true') {
                        value = true;
                    } else if (lowerCase === 'false') {
                        value = false;
                    }
                }

                dotProp.set(parsed, key.trim(), value);
            }
        }

        return parsed;
    }
};
