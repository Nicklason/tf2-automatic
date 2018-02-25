const TF2Items = require('tf2-items');

const Offer = require('./offer.js');

let Automatic, log, config, Items;

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;
    config = automatic.config;
};

exports.findMatch = findMatch;
exports.getItem = getItem;
exports.getQuality = getQuality;
exports.getEffectId = getEffectId;
exports.getEffectWithId = getEffectWithId;
exports.getName = getName;
exports.getProperItem = getProperItem;

exports.summary = summary;
exports.getItems = getItems;

function findMatch(search) {
    search = search.toLowerCase();

    let match = [];
    const schema = Items.schema.items;
    for (let i = 0; i < schema.length; i++) {
        let name = schema[i].item_name;
        if (schema[i].proper_name == true) {
            name = "The " + name;
        }

        if (name.toLowerCase() == search) {
            return schema[i].defindex;
        } else if (name.toLowerCase().indexOf(search) != -1) {
            match.push(schema[i]);
        }
    }

    if (match.length == 0) {
        return null;
    } else if (match.length == 1) {
        return match[0].defindex;
    }

    for (let i = 0; i < match.length; i++) {
        let name = schema[i].item_name;
        if (schema[i].proper_name == true) {
            name = "The " + name;
        }
        match[i] = name;
    }

    return match;
}

function summary(items) {
    let summary = {};

    for (let i = 0; i < items.length; i++) {
        let name = getName(items[i]);
        if (items[i].quality == 15) {
            name = "Decorated " + name;
        }
        summary[name] = (summary[name] || 0) + 1;
    }

    return summary;
}

function getItems(items) {
    let parsed = [];
    for (let i = 0; i < items.length; i++) {
        const item = Offer.getItem(items[i]);
        parsed.push(item);
    }
    return parsed;
}

function getItem(defindex) {
    return Items.schema.getItem(defindex);
}

function getQuality(quality) {
    return Items.schema.getQuality(quality);
}

function getEffectId(name) {
    return Items.schema.getEffectId(name);
}

function getEffectWithId(id) {
    return Items.schema.getEffectWithId(effect);
}

function getName(item) {
    item = getProperItem(item);
    return Items.schema.getDisplayName(item);
}

function getProperItem(item) {
    if (typeof item.quality === 'string') {
        item.quality = getQuality(item.quality);
    }
    if (typeof item.effect === 'string') {
        item.effect = getEffectId(item.effect);
    }

    return item;
}

exports.init = function (callback) {
    Items = new TF2Items({ apiKey: manager.apiKey });

    log.debug('Initializing tf2-items package.');
    Items.init(callback);
};