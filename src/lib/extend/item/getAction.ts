/**
 * Gets an action by name
 * @param action
 */
export = function(action: string): string {
    // @ts-ignore
    if (!Array.isArray(this.actions)) {
        return null;
    }

    // @ts-ignore
    const match: { link: string; name: string } = this.actions.find(v => v.name === action);

    if (match === undefined) {
        return null;
    } else {
        return match.link;
    }
};
