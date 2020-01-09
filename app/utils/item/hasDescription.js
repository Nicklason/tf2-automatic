/**
 * Checks if an item has a specific description
 * @param {String} description
 * @return {Boolean}
 */
module.exports = function (description) {
    if (!Array.isArray(this.descriptions)) {
        return false;
    }

    return this.descriptions.some(function (d) {
        return d.value === description;
    });
};
