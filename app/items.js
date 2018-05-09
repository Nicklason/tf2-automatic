const TF2Items = require('tf2-items');

const Offer = require('./offer.js');

let manager, log, Items;

exports.register = function (automatic) {
    manager = automatic.manager;
    log = automatic.log;
};

exports.init = function (callback) {
    Items = new TF2Items({ apiKey: manager.apiKey });

    log.debug('Initializing tf2-items package.');
    Items.init(function(err) {
        if (err) {
            callback(new Error('tf2-items (' + err.message + ')'));
            return;
        }
        callback(null);
    });
};

exports.createDictionary = createDictionary;
exports.createSummary = createSummary;
exports.getItemFromDict = getItemFromDict;
exports.pure = getPure;
exports.findMatch = findMatch;

exports.getQuality = getQuality;
exports.getEffect = getEffect;
exports.getName = getName;

exports.getModule = function() {
    return Items;
};

function createDictionary(items) {
    let dict = {};
    for (let i = 0; i < items.length; i++) {
        const item = Offer.getItem(items[i]);

        const name = getName(item);
        (dict[name] = (dict[name] || [])).push(item.id);
    }
    return dict;
}

function getPure(dictionary, getKeys = true) {
    const pure = {
        'keys': getKeys == true ? getItemFromDict(dictionary, 'Mann Co. Supply Crate Key') : [],
        'refined': getItemFromDict(dictionary, 'Refined Metal'),
        'reclaimed': getItemFromDict(dictionary, 'Reclaimed Metal'),
        'scrap': getItemFromDict(dictionary, 'Scrap Metal'),
    };
    return pure;
}

function getItemFromDict(dictionary, name) {
    return dictionary[name] || [];
}

function createSummary(dictionary) {
    let summary = {};
    for (let name in dictionary) {
        const amount = dictionary[name].length;
        summary[name] = amount;
    }
    return summary;
}

function findMatch(search) {
    search = search.toLowerCase();

    let match = [];
    const schema = Items.schema.items;
    for (let i in schema) {
        const name = schema[i].proper_name ? 'The ' + schema[i].item_name : schema[i].item_name;
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
        const name = match[i].proper_name ? 'The ' + match[i].item_name : match[i].item_name;
        match[i] = name;
    }

    return match;
}

function getQuality(quality) {
    return Items.schema.getQuality(quality);
}

function getEffect(effect) {
    return Items.schema.getEffectId(effect);
}

function getName(item) {
    return Items.schema.getDisplayName(item);
}