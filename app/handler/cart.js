const pluralize = require('pluralize');
const SKU = require('tf2-sku');

const inventory = require('../inventory');
const schemaManager = require('../../lib/tf2-schema');

class Cart {
    constructor (our, their) {
        this.our = (our || {});
        this.their = (their || {});
    }

    get () {
        return { our: this.our, their: this.their };
    }

    amount (name, whose) {
        if (!this._exist(name, whose)) {
            return 0;
        }

        return this[whose][name].amount;
    }

    add (sku, name, amount, whose) {
        if (!this._exist(name, whose)) {
            this[whose][name] = { sku, amount };
        } else {
            this[whose][name].amount += amount;
        }
    }

    remove (name, amount, whose) {
        if (this._exist(name, whose)) {
            this[whose][name].amount -= amount;
            if (this[whose][name].amount <= 0) {
                delete this[whose][name];
            }
        }
    }

    clear () {
        ['our', 'their'].forEach((whose) => this[whose] = {});
    }

    isEmpty () {
        return Object.getOwnPropertyNames(this.our).length === 0 && Object.getOwnPropertyNames(this.their).length === 0;
    }

    _exist (name, whose) {
        return this[whose][name] ? true : false;
    }
}


const carts = {};

function createCart (steamid) {
    carts[steamid] = new Cart();
}

function cartExists (steamid) {
    return !(carts[steamid] === undefined);
}

function deleteCart (steamid) {
    if (carts[steamid]) {
        delete carts[steamid];
    }
}

function getCart (steamid) {
    if (!cartExists(steamid)) {
        return undefined;
    }

    return carts[steamid];
}

exports.addToCart = function (steamID, sku, amount, deposit) {
    const side = deposit ? 'their' : 'our';

    const name = schemaManager.schema.getName(SKU.fromString(sku));

    let message;

    if (deposit) {
        message = pluralize(name, amount, true) + ' ' + (amount > 1 ? 'have' : 'has') + ' been added to your cart';
    } else {
        // Get all items in inventory, we don't need to check stock limits for withdrawals
        const amountCanTrade = inventory.getAmount(sku) - (cartExists(steamID) ? getCart(steamID).amount(name, side) : 0);

        // Correct trade if needed
        if (amountCanTrade <= 0) {
            message = 'I don\'t have any ' + pluralize(name, 0);
            amount = 0;
        } else if (amountCanTrade < amount) {
            amount = amountCanTrade;
            message = 'I only have ' + pluralize(name, amount, true) + '. ' + (amount > 1 ? 'They have' : 'It has') + ' been added to your cart';
        } else {
            message = pluralize(name, amount, true) + ' ' + (amount > 1 ? 'have' : 'has') + ' been added to your cart';
        }
    }

    if (amount > 0) {
        if (!cartExists(steamID)) {
            createCart(steamID);
        }

        getCart(steamID).add(sku, name, amount, side);
    }

    return { cart: getCart(steamID).get(), message };
};

exports.removeFromCart = function (steamID, name, amount, our, all = false) {
    if (!cartExists(steamID)) {
        return { cart: undefined, message: 'Your cart is empty' };
    }

    if (typeof name === 'boolean') {
        all = name;
    }

    let message;

    const side = our ? 'our' : 'their';

    if (all) {
        message = 'Your cart has been emptied';
        getCart(steamID).clear();
    } else {
        const whose = our ? 'my' : 'your';

        const inCart = getCart(steamID).amount(name, side);

        if (inCart === 0) {
            amount = inCart;
            message = 'There are no ' + pluralize(name, amount) + ' on ' + whose + ' side of the cart';
        } else if (amount > inCart) {
            amount = inCart;
            message = 'There were only ' + pluralize(name, amount, true) + ' on ' + whose + ' side of the cart. ' + (amount > 1 ? 'They have' : 'It has') + ' been removed';
        } else {
            message = pluralize(name, amount, true) + (amount > 1 ? ' have' : ' has') + ' been removed from ' + whose + ' side of the cart';
        }
    }

    getCart(steamID).remove(name, amount, side);

    if (getCart(steamID).isEmpty()) {
        deleteCart(steamID);
        return { cart: undefined, message };
    }

    return { cart: getCart(steamID).get(), message };
};
