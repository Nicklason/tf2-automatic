const TradeOfferManager = require('steam-tradeoffer-manager');
const confirmations = require('./confirmations.js');

const utils = require('./utils.js');

let Automatic;
let Items;

class Offer {
    constructor (offer) {
        this.offer = offer;
        this.items = { our: offer.itemsToGive, their: offer.itemsToReceive };
        this.currencies = { our: { keys: 0, metal: 0 }, their: { keys: 0, metal: 0 } };

        this.prices = [];

        this.offering = {
            metal: { us: false, them: false },
            keys: { us: false, them: false },
            items: { us: false, them: false }
        };

        this.games = [];
        this.recountCurrencies();
    }

    log (level, message) {
        Automatic.log[level]('Offer #' + this.offer.id + ' ' + message);
    }
    id () {
        return this.offer.id;
    }
    partner () {
        return this.offer.partner.getSteamID64();
    }
    fromOwner () {
        return Automatic.isOwner(this.partner());
    }
    isGlitched () {
        return this.offer.isGlitched();
    }
    isOneSided () {
        return this.offer.itemsToReceive.length == 0 || this.offer.itemsToGive.length == 0;
    }
    isGift () {
        return this.offer.itemsToReceive.length != 0 && this.offer.itemsToGive.length == 0;
    }
    state () {
        return this.offer.state;
    }

    static getItem (item) {
        const defindex = getDefindex(item);
        if (defindex === null) {
            return null;
        }

        const parsed = {
            id: Number(item.assetid),
            defindex: defindex,
            quality: getQuality(item),
            craftable: isCraftable(item),
            killstreak: isKillstreak(item),
            australium: isAustralium(item),
            effect: null
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

    recountCurrencies () {
        this._countCurrencies(true);
        this._countCurrencies(false);
    }

    _countCurrencies (our) {
        const items = our ? this.items.our : this.items.their;
        const currencies = our ? this.currencies.our : this.currencies.their;

        const other = [];
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

    accept (callback, tries = 0) {
        this.offer.accept((err, status) => {
            tries++;
            if (err) {
                if (tries > 2) {
                    return callback(getError(err), tries);
                }

                this.log('warn', `could not be accepted: ${err.message}, retrying in 5 seconds...`);

                if (err.message == 'Not Logged In' || err.message == 'ESOCKETTIMEDOUT') {
                    Automatic.refreshSession();
                }

                setTimeout(() => {
                    this.accept(callback, tries);
                }, 5000);
                return;
            }

            if (status == 'pending') {
                confirmations.accept(this.offer.id);
            }

            return callback(null, status);
        });
    }

    decline (callback) {
        this.offer.decline(function (err) {
            if (err) {
                return callback(getError(err));
            }

            return callback(null);
        });
    }

    summarizeItems (items) {
        const names = {};

        items.forEach((item) => {
            const name = getName(item);
            names[name] = (names[name] || 0) + 1;
        });

        const formattedNames = [];
        for (const name in names) {
            if (!names.hasOwnProperty(name)) {
                continue;
            }

            formattedNames.push(name + (names[name] > 1 ? ' x' + names[name] : ''));
        }

        return formattedNames.join(', ');
    }

    summary () {
        const our = {
            keys: this.currencies.our.keys,
            metal: utils.scrapToRefined(this.currencies.our.metal)
        };
        const their = {
            keys: this.currencies.their.keys,
            metal: utils.scrapToRefined(this.currencies.their.metal)
        };
        const message = 'Asked: ' + utils.currencyAsText(our) + ' (' + this.summarizeItems(this.offer.itemsToGive) + ')\nOffered: ' + utils.currencyAsText(their) + ' (' + this.summarizeItems(this.offer.itemsToReceive) + ')';
        return message;
    }
}

function getName (item) {
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

function getDefindex (item) {
    const link = getAction('Item Wiki Page...', item);
    if (link != null) {
        const query = utils.stringToObject(link.substring(link.indexOf('?') + 1));
        const defindex = parseInt(query.id);
        return defindex;
    } else {
        return null;
    }
}

function getQuality (item) {
    return getTag('Quality', item);
}

function isUnique (item) {
    return getQuality(item) == 'Unique';
}

function isCraftable (item) {
    return !hasDescription('( Not Usable in Crafting )', item);
}

function isKillstreak (item) {
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

function isAustralium (item) {
    if (getTag('Quality', item) != 'Strange') {
        return false;
    }
    return item.market_hash_name.indexOf('Australium ') != -1;
}

function getEffect (item) {
    if (isUnique(item)) return null;
    const descriptions = item.descriptions;
    if (!descriptions) return null;

    for (let i = 0; i < descriptions.length; i += 1) {
        const value = descriptions[i].value;
        if (value[0] == '\u2605') {
            return value.substr(18); // Remove "★ Unusual Effect: "
        }
    }

    return null;
}

function isSkin (item) {
    const wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle Scarred'];

    for (let i = 0; i < wears.length; i++) {
        if (item.market_name.indexOf(wears[i]) != -1) {
            return true;
        }
    }

    return false;
}

function isCraftWeapon (item) {
    if (item.marketable) return false;
    if (!isUnique(item)) return false;
    const type = getTag('Type', item);
    if (!type) return false;
    if (item.market_hash_name.match(/(Class|Slot) Token/)) return false;
    if (!isCraftable(item)) return false;
    if (item.market_name.indexOf('Festivized ') != -1) return false;
    if (item.market_name.indexOf('Festive ') != -1) return false;
    if (isKillstreak(item) != 0) return false;

    const notCraftWeapons = ['The Hot Hand', 'C.A.P.P.E.R', 'Horseless Headless Horsemann\'s', 'Three-Rune Blade', 'Nostromo Napalmer', 'AWPer Hand', 'Quäckenbirdt', 'Sharp Dresser', 'Conscientious Objector', 'Frying Pan', 'Batsaber', 'Black Rose', 'Scattergun', 'Rocket Launcher', 'Sniper Rifle', 'Shotgun', 'Grenade Launcher', 'Shooting Star', 'Big Kill', 'Fishcake', 'Giger Counter', 'Maul', 'Unarmed Combat', 'Crossing Guard', 'Wanga Prick', 'Freedom Staff', 'Ham Shank', 'Ap-Sap', 'Pistol', 'Bat', 'Flame Thrower', 'Construction PDA', 'Fire Axe', 'Stickybomb Launcher', 'Minigun', 'Medi Gun', 'SMG', 'Knife', 'Invis Watch', 'Sapper', 'Mutated Milk', 'Bread Bite', 'Snack Attack', 'Self - Aware Beauty Mark', 'Shovel', 'Bottle', 'Wrench', 'Bonesaw', 'Kukri', 'Fists', 'Syringe Gun', 'Revolver', 'Shotgun', 'SMG', 'Sapper', 'Grenade Launcher', 'Bonesaw', 'Revolver'];

    for (let i = 0; i < notCraftWeapons.length; i++) {
        const name = notCraftWeapons[i];
        if (item.market_name.indexOf(name) != -1) return false;
    }

    return ['Primary weapon', 'Secondary weapon', 'Melee weapon', 'Primary PDA', 'Secondary PDA'].indexOf(type) != -1;
}

function isKey (item) {
    return item.market_name == 'Mann Co. Supply Crate Key' && isUnique(item);
}

function getMetalValue (item) {
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

function getAction (action, item) {
    const actions = item.actions;
    if (!actions) return null;

    for (let i = 0; i < actions.length; i++) {
        if (actions[i].name == action) return actions[i].link;
    }

    return null;
}

function getTag (category, item) {
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

function hasDescription (desc, item) {
    const descriptions = item.descriptions;
    if (!descriptions) return false;

    return descriptions.some(function (d) {
        return d.value == desc;
    });
}

function getError (err) {
    let msg = err.cause || err.message;
    if (err.eresult) {
        msg = TradeOfferManager.EResult[err.eresult];
    }
    return msg;
}

module.exports = Offer;
module.exports.register = function (automatic) {
    Automatic = automatic;
    Items = automatic.items;
};
