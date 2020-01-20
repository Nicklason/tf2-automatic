/**
 * Checks if an item has a specific description
 * @param {String} description
 * @return {Boolean}
 */
module.exports = function (description) {
    // @ts-ignore
    if (!Array.isArray(this.descriptions)) {
        return false;
    }

    // @ts-ignore
    return this.descriptions.some(function (d) {
        return d.value === description;
    });
};
