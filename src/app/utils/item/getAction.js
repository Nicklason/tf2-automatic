/**
 * Gets an action by name
 * @param {String} action
 * @return {String|null}
 */
module.exports = function (action) {
    // @ts-ignore
    if (!Array.isArray(this.actions)) {
        return null;
    }

    // @ts-ignore
    const match = this.actions.find((v) => v.name === action);

    if (match === undefined) {
        return null;
    } else {
        return match.link;
    }
};
