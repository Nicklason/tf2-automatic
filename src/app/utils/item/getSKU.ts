const SKU = require('tf2-sku');

export default function () {
    // @ts-ignore
    const item = this.getItem();

    if (item === null) {
        return 'unknown';
    }

    return SKU.fromObject(item);
};
