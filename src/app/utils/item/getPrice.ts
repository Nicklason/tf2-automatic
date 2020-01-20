import * as prices from '../../prices';

export default function () {
    // @ts-ignore
    return prices.get(this.getSKU());
};
