/**
 * Gets a tag by category
 * @param {String} category
 * @return {String|null}
 */
export default function (category) {
    // @ts-ignore
    if (!Array.isArray(this.tags)) {
        return null;
    }

    // @ts-ignore
    const match = this.tags.find((v) => v.category === category);

    if (match === undefined) {
        return null;
    } else {
        // localized_tag_name for EconItem and name for CEconItem
        return match.localized_tag_name || match.name;
    }
};
