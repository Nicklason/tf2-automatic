export = function (v: string): object {
    try {
        return JSON.parse(v);
    } catch (err) {
        return null;
    }
};
