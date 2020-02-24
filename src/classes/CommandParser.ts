import dotProp from 'dot-prop';

import { UnknownDictionaryKnownValues } from '../types/common';
import { parseJSON } from '../lib/helpers';
import log from '../lib/logger';

export = class CommandParser {
    static getCommand(message: string): string | null {
        if (message.startsWith('!')) {
            const index = message.indexOf(' ');

            return message.substring(1, index === -1 ? undefined : index);
        }

        return null;
    }

    static removeCommand(message: string): string {
        return message.substring(message.indexOf(' ') + 1);
    }

    static parseParams(paramString: string): UnknownDictionaryKnownValues {
        const params = parseJSON(
            '{"' +
                paramString
                    .replace(/"/g, '\\"')
                    .replace(/&/g, '","')
                    .replace(/=/g, '":"') +
                '"}'
        ) as UnknownDictionaryKnownValues;

        const parsed = {};

        if (params !== null) {
            for (const key in params) {
                if (!Object.prototype.hasOwnProperty.call(params, key)) {
                    continue;
                }

                let value = params[key];

                if (key !== 'sku') {
                    if (typeof value !== 'string') {
                        log.debug(`Programmer error, expect value to be of type string, got ${typeof value}`);
                    }
                    const lowerCase = (value as string).toLowerCase();
                    if (/^-?\d+$/.test(lowerCase)) {
                        value = parseInt(lowerCase);
                    } else if (/^-?\d+(\.\d+)?$/.test(lowerCase)) {
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
