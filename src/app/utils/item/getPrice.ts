const prices = require('../../prices');

export default function () {
    // @ts-ignore
    return prices.get(this.getSKU());
};
