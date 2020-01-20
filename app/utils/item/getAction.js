/**
 * Gets an action by name
 * @param {String} action
 * @return {String}
 */
module.exports = function (action) {
    if (!Array.isArray(this.actions)) {
        return null;
    }

    const match = this.actions.find((v) => v.name === action);

    if (match === undefined) {
        return null;
    } else {
        return match.link;
    }
};
