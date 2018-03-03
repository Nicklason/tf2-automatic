const TradeOfferManager = require('steam-tradeoffer-manager');
const confirmations = require('./confirmations.js');

const utils = require('./utils.js');

let Automatic;

class Offer {
    constructor(offer, opts = {}) {
        this.offer = offer;
        // Non-pure items.
        this.items = { our: offer.itemsToGive, their: offer.itemsToReceive };
        this.currencies = { our: { keys: 0, metal: 0 }, their: { keys: 0, metal: 0 } };

        this.offeringMetal = { us: false, them: false };
        this.offeringKeys = { us: false, them: false };
        this.offeringItems = { us: false, them: false };

        this.games = [];
        if (opts.countCurrency !== false) {
            this.recountCurrencies();
        }
    }

    static getOfferError(err) {
        let msg = err.cause || err.message;
        if (err.eresult) {
            msg = TradeOfferManager.EResult[err.eresult];
        }
        return msg;
    }

    static isKey(item) {
        return item.market_hash_name === 'Mann Co. Supply Crate Key' && Offer.isUnique(item);
    }

    static isUnique(item) {
        return Offer.getQuality(item) == 'Unique';
    }

    static getQuality(item) {
        return Offer.getTag('Quality', item);
    }

    static getMetalValue(item) {
        if (!Offer.isUnique(item)) {
            return 0;
        }

        if (Offer.isCraftWeapon(item)) {
            return 1/18;
        }

        switch (item.market_hash_name) {
            case "Scrap Metal":
                return 1/9;
            case "Reclaimed Metal":
                return 1/3;
            case "Refined Metal":
                return 1;
        }

        return 0;
    }

    static isCraftable(item) {
        return Offer.hasDescription('( Not Usable in Crafting )', item);
    }

    static getEffect(item) {
        if (Offer.isUnique(item)) {
            return null;
        }
        const descriptions = item.descriptions;
        if (!descriptions) {
            return null;
        }

        for (let i = 0; i < descriptions.length; i += 1) {
            let value = descriptions[i].value;
            if (value[0] === "\u2605") { // Unusual star in inv
                return value.substr(18); // Remove "★ Unusual Effect: "
            }
        }

        return null;
    }

    static isCraftWeapon(item) {
        if (item.marketable) {
            return false;
        }

        if (!Offer.isUnique(item)) {
            return false;
        }
        
        var type = Offer.getTag('Type', item);
        if (!type) {
            return false;
        }

        if (item.market_hash_name.match(/(Class|Slot) Token/)) {
            return false;
        }

        if (!Offer.isCraftable(item)) {
            return false;
        }

        if (item.market_name.indexOf('Festivized ') != -1) {
            return false;
        }

        if (item.market_name.indexOf('Festive ') != -1) {
            return false;
        }

        if (Offer.isKillstreak(item) != 0) {
            return false;
        }

        // Yes, I know...
        const otherItemsThatAreNOTRandomCraftWeapons = [
            "C.A.P.P.E.R",
            "Horseless Headless Horsemann's",
            "Three-Rune Blade",
            "Nostromo Napalmer",
            "AWPer Hand",
            "Quäckenbirdt",
            "Sharp Dresser",
            "Conscientious Objector",
            "Frying Pan",
            "Batsaber",
            "Black Rose",
            "Scattergun",
            "Rocket Launcher",
            "Sniper Rifle",
            "Shotgun",
            "Grenade Launcher",
            "Shooting Star",
            "Big Kill",
            "Fishcake",
            "Giger Counter",
            "Maul",
            "Unarmed Combat",
            "Crossing Guard",
            "Wanga Prick",
            "Freedom Staff",
            "Ham Shank",
            "Ap-Sap",
            "Pistol",
            "Bat",
            "Flame Thrower",
            "Construction PDA",
            "Fire Axe",
            "Stickybomb Launcher",
            "Minigun",
            "Medi Gun",
            "SMG",
            "Knife",
            "Invis Watch",
            "Sapper", 
            "Mutated Milk",
            "Bread Bite",
            "Snack Attack",
            "Self - Aware Beauty Mark",
            "Shovel",
            "Bottle",
            "Wrench",
            "Bonesaw",
            "Kukri",
            "Fists",
            "Syringe Gun",
            "Revolver",
            "Shotgun",
            "SMG",
            "Sapper",
            "Grenade Launcher",
            "Bonesaw",
            "Revolver"
        ];

        for (let i = 0; i < otherItemsThatAreNOTRandomCraftWeapons.length; i++) {
            const name = otherItemsThatAreNOTRandomCraftWeapons[i];
            if (item.market_name.indexOf(name) != -1) {
                return false;
            }
        }

        return ["Primary weapon", "Secondary weapon", "Melee weapon", "Primary PDA", "Secondary PDA"].indexOf(type) !== -1;
    }

    static particleEffect(item) {
        const descriptions = item.descriptions;
        if (!descriptions) {
            return null;
        }

        for (let i = 0; i < descriptions.length; i++) {
            let value = descriptions[i].value;
            if (value[0] === '\u2605') {
                return value.substr(18);
            }
        }

        return null;
    }

    static isKillstreak(item) {
        if (Offer.hasDescriptionStartingWith('Killstreaker: ', item)) {
            return 3;
        } else if (Offer.hasDescriptionStartingWith('Sheen:', item)) {
            return 2;
        } else if (Offer.hasDescriptionStartingWith('Killstreaks Active', item)) {
            return 1;
        }
        return 0;
    }

    static isAustralium(item) {
        if (Offer.getTag('Quality', item) != 'Strange') {
            return false;
        }

        return item.market_hash_name.indexOf('Australium ') != -1;
    }

    static hasDescriptionStartingWith(desc, item) {
        const descriptions = item.descriptions;
        if (!descriptions) {
            return null;
        }

        return descriptions.some(function(d) {
            return d.value.startsWith(desc);
        });
    }

    static hasDescription(desc, item) {
        const descriptions = item.descriptions;
        if (!descriptions) {
            return null;
        }

        return !descriptions.some(function(d) {
            return d.value == desc;
        });
    }

    static getTag(category, item) {
        const tags = item.tags;
        if (!tags) {
            return null;
        }
        
        for (let i = 0; i < tags.length; i++) {
            // This will be used for both inventory items from the steam-tradeoffer-manager, and items from offers.
            if (tags[i].category === category || tags[i].category_name === category) {
                return tags[i].localized_tag_name || tags[i].name;
            }
        }

        return null;
    }

    static getAction(action, item) {
        const actions = item.actions;
        if (!actions) {
            return null;
        }

        for (let i = 0; i < actions.length; i++) {
            if (actions[i].name == action) {
                return actions[i].link;
            }
        }

        return null;
    }

    static getDefindex(item) {
        let link = Offer.getAction('Item Wiki Page...', item);

        var query = utils.stringToObject(link.substring(link.indexOf('?') + 1));
        return parseInt(query.id);
    }

    // Get a schema-like item.
    static getItem(item) {
        let parsed = {
            defindex: Offer.getDefindex(item),
            quality: Offer.getQuality(item),
            craftable: Offer.isCraftable(item),
            killstreak: Offer.isKillstreak(item),
            australium: Offer.isAustralium(item)
        };

        var effect = Offer.getEffect(item);

        if (effect) {
            parsed.effect = effect;
        }

        if (Offer.isSkin(item)) {
            parsed.quality = 'Decorated Weapon';
        }

        return parsed;
    }

    static isSkin(item) {
        const wears = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle Scarred"];

        for (let i = 0; i < wears.length; i++) {
            const wear = wears[i];
            if (item.market_name.indexOf(wear) !== -1) {
                return true;
            }
        }

        return false;
    }

    static isMetal(item) {
        const name = item.market_hash_name || item.market_name;
        return (name === "Scrap Metal" || name === "Reclaimed Metal" || name === "Refined Metal") && this.isUnique(item);
    }

    static getName(item) {
        let name = item.market_hash_name;
        let effect = Offer.getEffect(item);

        if (effect) {
            name = name.replace('Unusual ', '');
            if (name.startsWith('Strange ')) {
                name = "Strange " + effect + " " + name.substr(name.indexOf(' ') + 1);
            } else {
                name = effect + " " + name;
            }
        }

        if (!Offer.isCraftable(item)) {
            name = "Non-Craftable " + name;
        }

        return name;
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

            if (this.games.indexOf(item.appid) === -1) {
                this.games.push(item.appid);
            }

            if (Offer.isKey(item)) {
                currencies.keys++;
                this.offeringKeys[our ? "us" : "them"] = true;
            } else {
                const metal = Offer.getMetalValue(item);
                if (metal > 0) {
                    currencies.metal = utils.scrapToRefined(utils.refinedToScrap(currencies.metal) + utils.refinedToScrap(metal));
                    this.offeringMetal[our ? "us" : "them"] = true;
                } else {
                    this.offeringItems[our ? "us" : "them"] = true;
                }
            }

            if (Offer.isKey(item) == false && Offer.getMetalValue(item) === 0) {
                // Filtering our items that has a metal value as we don't want to be checking those items when reading the offer.
                other.push(item);
            }
        }

        this.items[our ? "our" : "their"] = other;
    }

    accept() {
        let self = this;
        return new Promise(function(resolve, reject) {
            self.offer.accept(function(err, status) {
                if (err) {
                    reject(Offer.getOfferError(err));
                    return;
                }
                if (!self.isGiftOffer()) {
                    confirmations.accept(self.id());
                }
                resolve(status);
            });
        });
    }
    decline() {
        return new Promise((resolve, reject) => {
            this.offer.decline((err, status) => {
                if (err) {
                    reject(Offer.getOfferError(err));
                } else {
                    resolve(status);
                }
            });
        });
    }

    determineEscrowDays() {
        return new Promise((resolve, reject) => {
            this.offer.getUserDetails((err, my, them) => {
                if (err) {
                    return reject(err);
                }

                const myDays = my.escrowDays;
                const theirDays = them.escrowDays;
                let escrowDays = 0;

                if (this.offer.itemsToReceive.length !== 0 && theirDays > escrowDays) {
                    escrowDays = theirDays;
                }

                if (this.offer.itemsToGive.length !== 0 > 0 && myDays > escrowDays) {
                    escrowDays = myDays;
                }

                resolve(escrowDays);
            });
        });
    }

    summarizeItems(items) {
        let names = {};

        items.forEach((item) => {
            let name = Offer.getName(item);
            names[name] = (names[name] || 0) + 1;
        });

        let formattedNames = [];
        for (let name in names) {
            formattedNames.push(name + (names[name] > 1 ? " x" + names[name] : ""));
        }

        return formattedNames.join(', ');
    }

    summary() {
        const message = "Asked: " + utils.currencyAsText(this.currencies.our) + " (" + this.summarizeItems(this.offer.itemsToGive) + ")\nOffered: " + utils.currencyAsText(this.currencies.their) + " (" + this.summarizeItems(this.offer.itemsToReceive) + ")";
        return message;
    }
    get(property) {
        return this.offer[property];
    }
    partnerID64() {
        return this.get('partner').toString();
    }
    partnerID3() {
        return this.get('partner').getSteam3RenderedID()
    }
    id() {
        return this.get('id');
    }
    state() {
        return this.get('state');
    }
    isGlitched() {
        return this.offer.isGlitched();
    }
    isOneSided() {
        return this.get('itemsToReceive').length === 0 || this.get('itemsToGive').length === 0;
    }
    isGiftOffer() {
        return this.get('itemsToGive').length === 0 && this.get('itemsToReceive').length !== 0
    }
    fromOwner() {
        let owners = (Automatic.config.get().owners || []);
        return owners.indexOf(this.partnerID64()) !== -1;
    }
    log(level, msg) {
        Automatic.log[level]('Offer #' + this.id() + ' ' + msg);
    }
}

module.exports = Offer;
module.exports.register = function (automatic) {
    Automatic = automatic;
};