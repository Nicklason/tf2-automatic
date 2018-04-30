const TradeOfferManager = require('steam-tradeoffer-manager');
const confirmations = require('./confirmations.js');

const utils = require('./utils.js');

let Automatic, Items;

class Offer {
    constructor(offer, opts = {}) {
        this.offer = offer;
        this.items = { our: offer.itemsToGive, their: offer.itemsToReceive };
        this.currencies = { our: { keys: 0, metal: 0 }, their: { keys: 0, metal: 0 } };

        this.offering = {
            metal: { us: false, them: false },
            keys: { us: false, them: false },
            items: { us: false, them: false }
        };

        this.games = [];
        if (opts.countCurrency != false) {
            this.recountCurrencies();
        }
    }

    log(level, message) {
        Automatic.log[level]('Offer #' + this.offer.id + ' from ' + this.partner() + ' ' + message);
    }
    id() {
        return this.offer.id;
    }
    partner() {
        return this.offer.partner.getSteamID64();
    }
    fromOwner() {
        return Automatic.isOwner(this.partner());
    }
    isGlitched() {
        return this.offer.isGlitched();
    }
    isOneSided() {
        return this.offer.itemsToReceive.length == 0 || this.offer.itemsToGive.length == 0;
    }
    isGift() {
        return this.offer.itemsToReceive.length != 0 && this.offer.itemsToGive.length == 0;
    }
    state() {
        return this.offer.state;
    }

    static getItem(item) {
        let parsed = {
            id: Number(item.assetid),
            defindex: getDefindex(item),
            quality: getQuality(item),
            craftable: isCraftable(item),
            killstreak: isKillstreak(item),
            australium: isAustralium(item)
        };

        const effect = getEffect(item);
        if (effect != null) {
            parsed.effect = Items.getEffect(effect);
        }

        if (isSkin(item)) {
            parsed.quality = 'Decorated Weapon';
        }

        parsed.quality = Items.getQuality(parsed.quality);

        return parsed;
    }

    recountCurrencies() {
        this._countCurrencies(true);
        this._countCurrencies(false);
    }

    _countCurrencies(our) {
        const items = our ? this.items.our : this.items.their;
        let currencies = our ? this.currencies.our : this.currencies.their;

        let other = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (this.games.indexOf(item.appid) == -1) {
                this.games.push(item.appid);
            }

            if (isKey(item)) {
                currencies.keys++;
                this.offering.keys[our ? 'us' : 'them'] = true;
            } else {
                const metal = getMetalValue(item);
                if (metal > 0) {
                    currencies.metal += utils.refinedToScrap(metal);
                    this.offering.metal[our ? 'us' : 'them'] = true;
                } else {
                    // Filtering our items that has a metal value as we don't want to be checking those items when reading the offer.
                    other.push(item);
                    this.offering.items[our ? 'us' : 'them'] = true;
                }
            }
        }

        this.items[our ? 'our' : 'their'] = other;
    }

    accept() {
        const self = this;
        return new Promise(function(resolve, reject) {
            self.offer.accept(function (err, status) {
                if (err) {
                    reject(getError(err));
                    return;
                }

                if (status == 'pending') {
                    confirmations.accept(self.offer.id);
                }

                resolve(status);
            });
        });
    }

    decline() {
        const self = this;
        return new Promise(function(resolve, reject) {
            self.offer.decline(function(err) {
                if (err) {
                    reject(getError(err));
                    return;
                }

                resolve();
            });
        });
    }

    summarizeItems(items) {
        let names = {};

        items.forEach((item) => {
            let name = getName(item);
            names[name] = (names[name] || 0) + 1;
        });

        let formattedNames = [];
        for (let name in names) {
            formattedNames.push(name + (names[name] > 1 ? ' x' + names[name] : ''));
        }

        return formattedNames.join(', ');
    }

    summary() {
        const our = { keys: this.currencies.our.keys, metal: utils.scrapToRefined(this.currencies.our.metal) };
        const their = { keys: this.currencies.their.keys, metal: utils.scrapToRefined(this.currencies.their.metal) };
        const message = 'Asked: ' + utils.currencyAsText(our) + ' (' + this.summarizeItems(this.offer.itemsToGive) + ')\nOffered: ' + utils.currencyAsText(their) + ' (' + this.summarizeItems(this.offer.itemsToReceive) + ')';
        return message;
    }
}

function getName(item) {
    let name = item.market_hash_name;
    const effect = getEffect(item);

    if (effect) {
        name = name.replace('Unusual ', '');
        name = name.startsWith('Strange ') ? 'Strange ' + effect + ' ' + name.substr(name.indexOf(' ') + 1) : effect + ' ' + name;
    }

    if (!isCraftable(item)) {
        name = 'Non-Craftable ' + name;
    }

    return name;
}

function getDefindex(item) {
    const link = getAction('Item Wiki Page...', item);
    const query = utils.stringToObject(link.substring(link.indexOf('?') + 1));
    return parseInt(query.id);
}

function getQuality(item) {
    return getTag('Quality', item);
}

function isUnique(item) {
    return getQuality(item) == 'Unique';
}

function isCraftable(item) {
    return hasDescription('( Not Usable in Crafting )', item);
}

function isKillstreak(item) {
    const name = item.market_hash_name;
    if (name.indexOf('Professional Killstreak ') != -1) {
        return 3;
    } else if (name.indexOf('Specialized Killstreak ') != -1) {
        return 2;
    } else if (name.indexOf('Killstreak ') != -1) {
        return 1;
    } else {
        return 0;
    }
}

function isAustralium(item) {
    if (getTag('Quality', item) != 'Strange') {
        return false;
    }
    return item.market_hash_name.indexOf('Australium ') != -1;
}

function getEffect(item) {
    if (isUnique(item)) return null;
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    for (let i = 0; i < descriptions.length; i += 1) {
        let value = descriptions[i].value;
        if (value[0] == '\u2605') {
            return value.substr(18); // Remove "★ Unusual Effect: "
        }
    }

    return null;
}

function isSkin(item) {
    const wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle Scarred'];

    for (let i = 0; i < wears.length; i++) {
        if (item.market_name.indexOf(wears[i]) != -1) {
            return true;
        }
    }

    return false;
}

function isCraftWeapon(item) {
    if (item.marketable) return false;
    if (!isUnique(item)) return false;
    const type = getTag('Type', item);
    if (!type) return false;
    if (item.market_hash_name.match(/(Class|Slot) Token/)) return false;
    if (!isCraftable(item)) return false;
    if (item.market_name.indexOf('Festivized ') != -1) return false;
    if (item.market_name.indexOf('Festive ') != -1) return false;
    if (isKillstreak(item) != 0) return false;

    const notCraftWeapons = ['C.A.P.P.E.R', 'Horseless Headless Horsemann\'s', 'Three-Rune Blade', 'Nostromo Napalmer', 'AWPer Hand', 'Quäckenbirdt', 'Sharp Dresser', 'Conscientious Objector', 'Frying Pan', 'Batsaber', 'Black Rose', 'Scattergun', 'Rocket Launcher', 'Sniper Rifle', 'Shotgun', 'Grenade Launcher', 'Shooting Star', 'Big Kill', 'Fishcake', 'Giger Counter', 'Maul', 'Unarmed Combat', 'Crossing Guard', 'Wanga Prick', 'Freedom Staff', 'Ham Shank', 'Ap-Sap', 'Pistol', 'Bat', 'Flame Thrower', 'Construction PDA', 'Fire Axe', 'Stickybomb Launcher', 'Minigun', 'Medi Gun', 'SMG', 'Knife', 'Invis Watch', 'Sapper', 'Mutated Milk', 'Bread Bite', 'Snack Attack', 'Self - Aware Beauty Mark', 'Shovel', 'Bottle', 'Wrench', 'Bonesaw', 'Kukri', 'Fists', 'Syringe Gun', 'Revolver', 'Shotgun', 'SMG', 'Sapper', 'Grenade Launcher', 'Bonesaw', 'Revolver'];

    for (let i = 0; i < notCraftWeapons.length; i++) {
        const name = notCraftWeapons[i];
        if (item.market_name.indexOf(name) != -1) return false;
    }

    return ['Primary weapon', 'Secondary weapon', 'Melee weapon', 'Primary PDA', 'Secondary PDA'].indexOf(type) != -1;
}

function isKey(item) {
    return item.market_name == 'Mann Co. Supply Crate Key' && isUnique(item);
}

function getMetalValue(item) {
    if (!isUnique(item)) return 0;

    if (isCraftWeapon(item)) return 1 / 18;

    switch (item.market_hash_name) {
        case 'Scrap Metal':
            return 1 / 9;
        case 'Reclaimed Metal':
            return 1 / 3;
        case 'Refined Metal':
            return 1;
    }

    return 0;
}

function getAction(action, item) {
    const actions = item.actions;
    if (!actions) return null;

    for (let i = 0; i < actions.length; i++) {
        if (actions[i].name == action) return actions[i].link;
    }

    return null;
}

function getTag(category, item) {
    const tags = item.tags;
    if (!tags) {
        return null;
    }

    for (let i = 0; i < tags.length; i++) {
        if (tags[i].category == category || tags[i].category_name == category) {
            return tags[i].localized_tag_name || tags[i].name;
        }
    }

    return null;
}

function hasDescription(desc, item) {
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    return !descriptions.some(function (d) {
        return d.value == desc;
    });
}

function getError(err) {
    let msg = err.cause || err.message;
    if (err.eresult) {
        msg = TradeOfferManager.EResult[err.eresult];
    }
    return msg;
}


/*








exports.register = function(automatic) {
    Automatic = automatic;
    Items = automatic.items;
};

exports.log = log;
exports.error = error;
exports.accepted = accepted;

exports.onlyTF2 = onlyTF2;
exports.partner = partner;
exports.isGlitched = isGlitched;
exports.isOneSided = isOneSided;
exports.isGift = isGift;

exports.pure = getPure;

function log(offer, level, message) {
    Automatic.log[level]('Offer #' + offer.id + ' ' + message);
}

function error(offer, action, err) {
    const message = action + ' (' + getError(err) + ')';
    log(offer, 'warn', message);
}

function accepted(offer, status) {
    const message = 'successfully accepted' + (status == 'pending' ? '; confirmation required' : '');
    log(offer, 'trade', message);
}

function games(offer) {
    let appids = [];
    for (let i = 0; i < offer.itemsToGive.length; i++) {
        const appid = offer.itemsToGive[i].appid;
        if (appids.indexOf(item.appid) == -1) appids.push(appid);
    }

    for (let i = 0; i < offer.itemsToReceive.length; i++) {
        const appid = offer.itemsToReceive[i].appid;
        if (appids.indexOf(item.appid) == -1) appids.push(appid);
    }

    return appids;
}

function onlyTF2(offer) {
    const appids = games(offer);
    return appids.length == 1 && appids[0] == 440;
}

function partner(offer) {
    return offer.partner.getSteamID64();
}

function isGlitched(offer) {
    return offer.isGlitched();
}

function isOneSided(offer) {
    return offer.itemsToGive.length == 0 || offer.itemsToReceive.length == 0;
}

function isGift(offer) {
    return offer.itemsToGive.length == 0 && offer.itemsToReceive.length != 0;
}









function getDefindex(item) {
    let link = Offer.getAction('Item Wiki Page...', item);

    var query = utils.stringToObject(link.substring(link.indexOf('?') + 1));
    return parseInt(query.id);
}

function getQuality(item) {
    return getTag('Quality', item);
}

function isCraftable(item) {
    return hasDescription('( Not Usable in Crafting )', item);
}

function isKillstreak(item) {
    if (Offer.hasDescriptionStartingWith('Killstreaker: ', item)) return 3;
    if (Offer.hasDescriptionStartingWith('Sheen:', item)) return 2;
    if (Offer.hasDescriptionStartingWith('Killstreaks Active', item)) return 1;
    return 0;
}

function isAustralium(item) {
    if (Offer.getTag('Quality', item) != 'Strange') {
        return false;
    }

    return item.market_hash_name.indexOf('Australium ') != -1;
}

function getEffect(item) {
    if (Offer.isUnique(item)) return null;
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    for (let i = 0; i < descriptions.length; i += 1) {
        let value = descriptions[i].value;
        if (value[0] === '\u2605') return value.substr(18); // Remove "★ Unusual Effect: "
    }

    return null;
}

function getItem(item) {
    let parsed = {
        id: Number(item.assetid),
        defindex: getDefindex(item),
        quality: getQuality(item),
        craftable: isCraftable(item),
        killstreak: isKillstreak(item),
        australium: isAustralium(item)
    };

    let effect = getEffect(item);
    if (effect != null) parsed.effect = Items.getEffect(effect);

    if (isSkin(item)) {
        parsed.quality = 'Decorated Weapon';
    }

    parsed.quality = Items.getQuality(parsed.quality);
    return parsed;
}

function isUnique(item) {
    return getQuality(item) == 'Unique';
}

function isSkin(item) {
    const wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle Scarred'];

    for (let i = 0; i < wears.length; i++) {
        const wear = wears[i];
        if (item.market_name.indexOf(wear) !== -1) return true;
    }

    return false;
}

function isKey(item) {
    return item.market_name == 'Mann Co. Supply Crate Key' && isUnique(item);
}

function getPure(items) {
    let pure = { keys: 0, metal: 0 };

    for (let i = 0; i < items.length; i++) {
        if (isKey(items[i])) {
            pure.keys++;
        } else {
            const metal = getMetalValue(items[i]);
            if (metal > 0) {
                metal += utils.refinedToScrap(metal);
            }
        }
    }

    return pure;
}

function getItems(items) {
    let filtered = [];
    for (let i = 0; i < items.length; i++) {
        if (isKey(items[i]) == false && getMetalValue(items[i]) == 0) filtered.push(items[i]);
    }
    return filtered;
}

function getMetalValue(item) {
    if (!isUnique(item)) return 0;

    if (isCraftWeapon(item)) return 1 / 18;

    switch (item.market_hash_name) {
        case 'Scrap Metal':
            return 1 / 9;
        case 'Reclaimed Metal':
            return 1 / 3;
        case 'Refined Metal':
            return 1;
    }

    return 0;
}

function isCraftWeapon(item) {
    if (item.marketable) return false;
    if (!isUnique(item)) return false;
    const type = Offer.getTag('Type', item);
    if (!type) return false;
    if (item.market_hash_name.match(/(Class|Slot) Token/)) return false;
    if (!isCraftable(item)) return false;
    if (item.market_name.indexOf('Festivized ') != -1) return false;
    if (item.market_name.indexOf('Festive ') != -1) return false;
    if (isKillstreak(item) != 0) return false;

    const notCraftWeapons = [ 'C.A.P.P.E.R', 'Horseless Headless Horsemann\'s', 'Three-Rune Blade', 'Nostromo Napalmer', 'AWPer Hand', 'Quäckenbirdt', 'Sharp Dresser', 'Conscientious Objector', 'Frying Pan', 'Batsaber', 'Black Rose', 'Scattergun', 'Rocket Launcher', 'Sniper Rifle', 'Shotgun', 'Grenade Launcher', 'Shooting Star', 'Big Kill', 'Fishcake', 'Giger Counter', 'Maul', 'Unarmed Combat', 'Crossing Guard', 'Wanga Prick', 'Freedom Staff', 'Ham Shank', 'Ap-Sap', 'Pistol', 'Bat', 'Flame Thrower', 'Construction PDA', 'Fire Axe', 'Stickybomb Launcher', 'Minigun', 'Medi Gun', 'SMG', 'Knife', 'Invis Watch', 'Sapper', 'Mutated Milk', 'Bread Bite', 'Snack Attack', 'Self - Aware Beauty Mark', 'Shovel', 'Bottle', 'Wrench', 'Bonesaw', 'Kukri', 'Fists', 'Syringe Gun', 'Revolver', 'Shotgun', 'SMG', 'Sapper', 'Grenade Launcher', 'Bonesaw', 'Revolver' ];

    for (let i = 0; i < notCraftWeapons.length; i++) {
        const name = notCraftWeapons[i];
        if (item.market_name.indexOf(name) != -1) return false;
    }

    return ['Primary weapon', 'Secondary weapon', 'Melee weapon', 'Primary PDA', 'Secondary PDA'].indexOf(type) != -1;
}



function hasDescriptionStartingWith(desc, item) {
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    return descriptions.some(function (d) {
        return d.value.startsWith(desc);
    });
}

function hasDescription(desc, item) {
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    return !descriptions.some(function (d) {
        return d.value == desc;
    });
}

function getTag(category, item) {
    const tags = item.tags;
    if (!tags) {
        return null;
    }

    for (let i = 0; i < tags.length; i++) {
        if (tags[i].category == category || tags[i].category_name == category) return tags[i].localized_tag_name || tags[i].name;
    }

    return null;
}

function getAction(action, item) {
    const actions = item.actions;
    if (!actions) return null;

    for (let i = 0; i < actions.length; i++) {
        if (actions[i].name == action) return actions[i].link;
    }

    return null;
}





function getError(err) {
    let msg = err.cause || err.message;
    if (err.eresult) {
        msg = TradeOfferManager.EResult[err.eresult];
    }
    return msg;
}

function accept(offer) {
    offer.accept(function (err, status) {
        if (err) {
            error(offer, 'could not be accepted', err);
            return;
        }

        accepted(offer, status);
        if (!isGift(offer)) confirmations.accept(offer.id);
    });
}

function decline(offer) {
    offer.decline(function (err) {
        if (err) error(offer, 'could not be declined', err);
        else log(offer, 'info', 'declined');
    });
}
*/

module.exports = Offer;
module.exports.register = function(automatic) {
    Automatic = automatic;
    Items = automatic.items;
};