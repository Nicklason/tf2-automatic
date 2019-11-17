/**
 * Gets a tag by category
 * @param {String} category
 * @return {String}
 */
module.exports = function (category) {
    if (!Array.isArray(this.tags)) {
        return null;
    }

    const match = this.tags.find((v) => v.category === category);

    if (match === undefined) {
        return null;
    } else {
        // localized_tag_name for EconItem and name for CEconItem
        return match.localized_tag_name || match.name;
    }
};
