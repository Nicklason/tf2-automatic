import Handler from './Handler';
import Bot from './Bot';
import { Entry, EntryData } from './Pricelist';
import Commands from './Commands';
import CartQueue from './CartQueue';
import Inventory from './Inventory';
import { UnknownDictionary } from '../types/common';

import SteamUser from 'steam-user';
import TradeOfferManager, { TradeOffer, PollData } from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';
import SteamID from 'steamid';
import Currencies from 'tf2-currencies';

import log from '../lib/logger';
import * as files from '../lib/files';
import paths from '../resources/paths';
import { parseJSON, exponentialBackoff } from '../lib/helpers';

export = class MyHandler extends Handler {
    private readonly commands: Commands;

    readonly cartQueue: CartQueue;

    private groups: string[] = [];

    private friendsToKeep: string[] = [];

    private minimumScrap = 9;

    private minimumReclaimed = 9;

    private combineThreshold = 9;

    recentlySentMessage: UnknownDictionary<number> = {};

    constructor(bot: Bot) {
        super(bot);

        this.commands = new Commands(bot);
        this.cartQueue = new CartQueue(bot);

        const minimumScrap = parseInt(process.env.MINIMUM_SCRAP);
        const minimumReclaimed = parseInt(process.env.MINIMUM_RECLAIMED);
        const combineThreshold = parseInt(process.env.METAL_THRESHOLD);

        if (!isNaN(minimumScrap)) {
            this.minimumScrap = minimumScrap;
        }

        if (!isNaN(minimumReclaimed)) {
            this.minimumReclaimed = minimumReclaimed;
        }

        if (!isNaN(combineThreshold)) {
            this.combineThreshold = combineThreshold;
        }

        const groups = parseJSON(process.env.GROUPS);
        if (groups !== null && Array.isArray(groups)) {
            groups.forEach(function(groupID64) {
                if (!new SteamID(groupID64).isValid()) {
                    throw new Error('Invalid group SteamID64 "' + groupID64 + '"');
                }
            });

            this.groups = groups;
        }

        const friendsToKeep = parseJSON(process.env.KEEP_FRIENDS);
        if (friendsToKeep !== null && Array.isArray(friendsToKeep)) {
            friendsToKeep.forEach(function(steamID64) {
                if (!new SteamID(steamID64).isValid()) {
                    throw new Error('Invalid SteamID64 "' + steamID64 + '"');
                }
            });

            this.friendsToKeep = friendsToKeep;
        }

        setInterval(() => {
            this.recentlySentMessage = {};
        }, 1000);
    }

    onRun(): Promise<{
        loginAttempts?: number[];
        pricelist?: EntryData[];
        loginKey?: string;
        pollData?: PollData;
    }> {
        return Promise.all([
            files.readFile(paths.files.loginKey, false),
            files.readFile(paths.files.pricelist, true),
            files.readFile(paths.files.loginAttempts, true),
            files.readFile(paths.files.pollData, true)
        ]).then(function([loginKey, pricelist, loginAttempts, pollData]) {
            return { loginKey, pricelist, loginAttempts, pollData };
        });
    }

    onReady(): void {
        log.info(
            'tf2-automatic v' +
                process.env.BOT_VERSION +
                ' is ready! ' +
                pluralize('item', this.bot.pricelist.getLength(), true) +
                ' in pricelist, ' +
                pluralize('listing', this.bot.listingManager.listings.length, true) +
                ' on www.backpack.tf (cap: ' +
                this.bot.listingManager.cap +
                ')'
        );

        this.bot.client.gamesPlayed('tf2-automatic');
        this.bot.client.setPersona(SteamUser.EPersonaState.Online);

        // Smelt / combine metal if needed
        this.keepMetalSupply();

        // Sort the inventory after crafting / combining metal
        this.sortInventory();

        // Check friend requests that we got while offline
        this.checkFriendRequests();

        // Check group invites that we got while offline
        this.checkGroupInvites();

        // Set up autorelist if enabled in environment variable
        this.bot.listings.setupAutorelist();
    }

    onShutdown(): Promise<void> {
        return new Promise(resolve => {
            if (this.bot.listingManager.ready !== true) {
                // We have not set up the listing manager, don't try and remove listings
                return resolve();
            }

            this.bot.listings.removeAll().asCallback(function(err) {
                if (err) {
                    log.warn('Failed to r emove all listings: ', err);
                }

                resolve();
            });
        });
    }

    onLoggedOn(): void {
        if (this.bot.isReady()) {
            this.bot.client.setPersona(SteamUser.EPersonaState.Online);
            this.bot.client.gamesPlayed('tf2-automatic');
        }
    }

    onMessage(steamID: SteamID, message: string): void {
        const steamID64 = steamID.toString();

        if (!this.bot.friends.isFriend(steamID64)) {
            return;
        }

        const friend = this.bot.friends.getFriend(steamID64);

        if (friend === null) {
            log.info('Message from ' + steamID64 + ': ' + message);
        } else {
            log.info('Message from ' + friend.player_name + ' (' + steamID64 + '): ' + message);
        }

        if (this.recentlySentMessage[steamID64] !== undefined && this.recentlySentMessage[steamID64] >= 1) {
            return;
        }

        this.recentlySentMessage[steamID64] = this.recentlySentMessage[steamID64] + 1;

        this.commands.processMessage(steamID, message);
    }

    onLoginKey(loginKey: string): void {
        log.debug('New login key');

        files.writeFile(paths.files.loginKey, loginKey, false).catch(function(err) {
            log.warn('Failed to save login key: ', err);
        });
    }

    onLoginError(err: Error): void {
        // @ts-ignore
        if (err.eresult === SteamUser.EResult.InvalidPassword) {
            files.deleteFile(paths.files.loginKey).catch(err => {
                log.warn('Failed to delete login key: ', err);
            });
        }
    }

    onLoginAttempts(attempts: number[]): void {
        files.writeFile(paths.files.loginAttempts, attempts, true).catch(function(err) {
            log.warn('Failed to save login attempts: ', err);
        });
    }

    onFriendRelationship(steamID: SteamID, relationship: number): void {
        if (relationship === SteamUser.EFriendRelationship.Friend) {
            this.onNewFriend(steamID);
            this.checkFriendsCount(steamID);
        } else if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
            this.respondToFriendRequest(steamID);
        }
    }

    onGroupRelationship(groupID: SteamID, relationship: number): void {
        log.debug('Group relation changed', { steamID: groupID, relationship: relationship });
        if (relationship === SteamUser.EClanRelationship.Invited) {
            const join = !this.groups.includes(groupID.getSteamID64());

            log.info(
                'Got invited to group ' + groupID.getSteamID64() + ', ' + (join ? 'accepting...' : 'declining...')
            );
            this.bot.client.respondToGroupInvite(groupID, !this.groups.includes(groupID.getSteamID64()));
        } else if (relationship === SteamUser.EClanRelationship.Member) {
            log.info('Joined group ' + groupID.getSteamID64());
        }
    }

    onBptfAuth(auth: { apiKey: string; accessToken: string }): void {
        const details = Object.assign({ private: true }, auth);

        log.warn('Please add the backpack.tf API key and access token to the environment variables!', details);
    }

    onNewTradeOffer(
        offer: TradeOffer
    ): Promise<{
        action: 'accept' | 'decline' | null;
        reason: string | null;
    }> {
        return new Promise(resolve => {
            offer.log('info', 'is being processed...');

            const ourItems = Inventory.fromItems(
                this.bot.client.steamID,
                offer.itemsToGive,
                this.bot.manager,
                this.bot.schema
            );

            const theirItems = Inventory.fromItems(
                offer.partner,
                offer.itemsToReceive,
                this.bot.manager,
                this.bot.schema
            );

            const items = {
                our: ourItems.getItems(),
                their: theirItems.getItems()
            };

            const exchange = {
                contains: { items: false, metal: false, keys: false },
                our: { value: 0, keys: 0, scrap: 0, contains: { items: false, metal: false, keys: false } },
                their: { value: 0, keys: 0, scrap: 0, contains: { items: false, metal: false, keys: false } }
            };

            const itemsDict = { our: {}, their: {} };

            const states = [false, true];

            let hasInvalidItems = false;

            for (let i = 0; i < states.length; i++) {
                const buying = states[i];
                const which = buying ? 'their' : 'our';

                for (const sku in items[which]) {
                    if (!Object.prototype.hasOwnProperty.call(items[which], sku)) {
                        continue;
                    }

                    if (sku === 'unknown') {
                        // Offer contains an item that is not from TF2
                        hasInvalidItems = true;
                    }

                    if (sku === '5000;6') {
                        exchange.contains.metal = true;
                        exchange[which].contains.metal = true;
                    } else if (sku === '5001;6') {
                        exchange.contains.metal = true;
                        exchange[which].contains.metal = true;
                    } else if (sku === '5002;6') {
                        exchange.contains.metal = true;
                        exchange[which].contains.metal = true;
                    } else if (sku === '5021;6') {
                        exchange.contains.keys = true;
                        exchange[which].contains.keys = true;
                    } else {
                        exchange.contains.items = true;
                        exchange[which].contains.items = true;
                    }

                    const amount = items[which][sku].length;

                    itemsDict[which][sku] = amount;
                }
            }

            offer.data('dict', itemsDict);

            if (hasInvalidItems) {
                // Using boolean because items dict always needs to be saved
                offer.log('info', 'contains items not from TF2, declining...');
                return resolve({ action: 'decline', reason: 'INVALID_ITEMS' });
            }

            const itemsDiff = offer.getDiff();

            // Check if the offer is from an admin
            if (this.bot.isAdmin(offer.partner)) {
                offer.log('trade', 'is from an admin, accepting. Summary:\n' + offer.summarize(this.bot.schema));
                return resolve({ action: 'accept', reason: 'ADMIN' });
            }

            if (offer.itemsToGive.length === 0 && ['donate', 'gift'].includes(offer.message.toLowerCase())) {
                offer.log('trade', 'is a gift offer, accepting. Summary:\n' + offer.summarize(this.bot.schema));
                return resolve({ action: 'accept', reason: 'GIFT' });
            } else if (offer.itemsToReceive.length === 0 || offer.itemsToGive.length === 0) {
                offer.log('info', 'is a gift offer, declining...');
                return resolve({ action: 'decline', reason: 'GIFT' });
            }

            if (exchange.contains.metal && !exchange.contains.keys && !exchange.contains.items) {
                // Offer only contains metal
                offer.log('info', 'only contains metal, declining...');
                return resolve({ action: 'decline', reason: 'ONLY_METAL' });
            } else if (exchange.contains.keys && !exchange.contains.items) {
                // Offer is for trading keys, check if we are trading them
                const priceEntry = this.bot.pricelist.getPrice('5021;6', true);
                if (priceEntry === null) {
                    // We are not trading keys
                    offer.log('info', 'we are not trading keys, declining...');
                    return resolve({ action: 'decline', reason: 'NOT_TRADING_KEYS' });
                } else if (exchange.our.contains.keys && priceEntry.intent !== 1 && priceEntry.intent !== 2) {
                    // We are not selling keys
                    offer.log('info', 'we are not selling keys, declining...');
                    return resolve({ action: 'decline', reason: 'NOT_TRADING_KEYS' });
                } else if (exchange.their.contains.keys && priceEntry.intent !== 0 && priceEntry.intent !== 2) {
                    // We are not buying keys
                    offer.log('info', 'we are not buying keys, declining...');
                    return resolve({ action: 'decline', reason: 'NOT_TRADING_KEYS' });
                } else {
                    // Check overstock / understock on keys
                    const diff = itemsDiff['5021;6'];
                    // If the diff is greater than 0 then we are buying, less than is selling

                    if (diff !== 0 && this.bot.inventoryManager.amountCanTrade('5021;6', diff > 0) < diff) {
                        // User is taking too many / offering too many
                        offer.log('info', 'is taking / offering too many keys, declining...');
                        return resolve({ action: 'decline', reason: 'OVERSTOCKED' });
                    }
                }
            }

            const itemPrices = {};

            const keyPrice = this.bot.pricelist.getKeyPrice();

            for (let i = 0; i < states.length; i++) {
                const buying = states[i];
                const which = buying ? 'their' : 'our';
                const intentString = buying ? 'buy' : 'sell';

                for (const sku in items[which]) {
                    if (!Object.prototype.hasOwnProperty.call(items[which], sku)) {
                        continue;
                    }

                    const assetids = items[which][sku];
                    const amount = assetids.length;

                    if (sku === '5000;6') {
                        exchange[which].value += amount;
                        exchange[which].scrap += amount;
                    } else if (sku === '5001;6') {
                        const value = 3 * amount;
                        exchange[which].value += value;
                        exchange[which].scrap += value;
                    } else if (sku === '5002;6') {
                        const value = 9 * amount;
                        exchange[which].value += value;
                        exchange[which].scrap += value;
                    } else {
                        const match = this.bot.pricelist.getPrice(sku, true);

                        // TODO: Go through all assetids and check if the item is being sold for a specific price

                        if (match !== null && (sku !== '5021;6' || !exchange.contains.items)) {
                            // If we found a matching price and the item is not a key, or the we are not trading items (meaning that we are trading keys) then add the price of the item

                            // Add value of items
                            exchange[which].value += match[intentString].toValue(keyPrice.metal) * amount;
                            exchange[which].keys += match[intentString].keys * amount;
                            exchange[which].scrap += Currencies.toScrap(match[intentString].metal) * amount;

                            itemPrices[match.sku] = {
                                buy: match.buy,
                                sell: match.sell
                            };

                            // Check stock limits (not for keys)
                            const diff = itemsDiff[sku];

                            if (diff !== 0 && this.bot.inventoryManager.amountCanTrade(sku, diff > 0) < diff) {
                                // User is taking too many / offering too many
                                offer.log('info', 'is taking / offering too many, declining...');
                                return resolve({ action: 'decline', reason: 'OVERSTOCKED' });
                            }
                        } else if (sku === '5021;6' && exchange.contains.items) {
                            // Offer contains keys and we are not trading keys, add key value
                            exchange[which].value += keyPrice.toValue() * amount;
                            exchange[which].keys += amount;
                        } else if (match === null || match.intent === (buying ? 1 : 0)) {
                            // Offer contains an item that we are not trading
                            return resolve({ action: 'decline', reason: 'INVALID_ITEMS' });
                        }
                    }
                }
            }

            offer.data('value', {
                our: {
                    total: exchange.our.value,
                    keys: exchange.our.keys,
                    metal: Currencies.toRefined(exchange.our.scrap)
                },
                their: {
                    total: exchange.their.value,
                    keys: exchange.their.keys,
                    metal: Currencies.toRefined(exchange.their.scrap)
                },
                rate: keyPrice.metal
            });

            offer.data('prices', itemPrices);

            // Check if the values are correct
            if (exchange.our.value > exchange.their.value) {
                // We are offering more than them, decline the offer
                offer.log('info', 'is not offering enough, declining...');
                return resolve({ action: 'decline', reason: 'INVALID_VALUE' });
            } else if (exchange.our.value < exchange.their.value && process.env.ACCEPT_OVERPAY === 'false') {
                offer.log('info', 'is offering more than needed, declining...');
                return resolve({ action: 'decline', reason: 'OVERPAY' });
            }

            // TODO: If we are receiving items, mark them as pending and use it to check overstock / understock for new offers

            offer.log('info', 'checking escrow...');

            this.bot.checkEscrow(offer).asCallback((err, escrow) => {
                if (err) {
                    log.warn('Failed to check escrow: ', err);
                    return resolve();
                }

                if (escrow) {
                    offer.log('info', 'would be held if accepted, declining...');
                    return resolve({ action: 'decline', reason: 'ESCROW' });
                }

                offer.log('info', 'checking bans...');

                this.bot.checkBanned(offer.partner.getSteamID64()).asCallback((err, banned) => {
                    if (err) {
                        log.warn('Failed to check banned: ', err);
                        return resolve();
                    }

                    if (banned) {
                        offer.log('info', 'partner is banned in one or more communities, declining...');
                        return resolve({ action: 'decline', reason: 'BANNED' });
                    }

                    offer.log('trade', 'accepting. Summary:\n' + offer.summarize(this.bot.schema));

                    return resolve({ action: 'accept', reason: 'VALID' });
                });
            });
        });
    }

    // TODO: checkBanned and checkEscrow are copied from UserCart, don't duplicate them

    onTradeOfferChanged(offer: TradeOffer, oldState: number): void {
        // Not sure if it can go from other states to active
        if (oldState === TradeOfferManager.ETradeOfferState.Accepted) {
            offer.data('switchedState', oldState);
        }

        const handledByUs = offer.data('handledByUs') === true;

        if (handledByUs && offer.data('switchedState') !== offer.state) {
            if (offer.isOurOffer) {
                if (offer.state === TradeOfferManager.ETradeOfferState.Declined) {
                    this.bot.sendMessage(
                        offer.partner,
                        'Ohh nooooes! The offer is no longer available. Reason: The offer has been declined.'
                    );
                } else if (offer.state === TradeOfferManager.ETradeOfferState.Canceled) {
                    if (offer.data('canceledByUser') === true) {
                        this.bot.sendMessage(
                            offer.partner,
                            'Ohh nooooes! The offer is no longer available. Reason: Offer was canceled by user.'
                        );
                    } else if (oldState === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
                        this.bot.sendMessage(
                            offer.partner,
                            'Ohh nooooes! The offer is no longer available. Reason: Failed to accept mobile confirmation.'
                        );
                    } else {
                        this.bot.sendMessage(
                            offer.partner,
                            'Ohh nooooes! The offer is no longer available. Reason: The offer has been active for a while.'
                        );
                    }
                }
            }

            if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
                this.bot.messageAdmins(
                    'trade',
                    'Trade #' +
                        offer.id +
                        ' with ' +
                        offer.partner.getSteamID64() +
                        ' is accepted. Summary:\n' +
                        offer.summarize(this.bot.schema)
                );
                this.bot.sendMessage(offer.partner, 'Success! The offer went through successfully.');
            } else if (offer.state === TradeOfferManager.ETradeOfferState.InvalidItems) {
                this.bot.sendMessage(
                    offer.partner,
                    'Ohh nooooes! Your offer is no longer available. Reason: Items not available (traded away in a different trade).'
                );
            }
        }

        if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
            // Offer is accepted

            offer.data('isAccepted', true);

            offer.log('trade', 'has been accepted.');

            // Smelt / combine metal
            this.keepMetalSupply();

            // Sort inventory
            this.sortInventory();

            // Update listings
            const diff = offer.getDiff() || {};

            for (const sku in diff) {
                if (!Object.prototype.hasOwnProperty.call(diff, sku)) {
                    continue;
                }

                this.bot.listings.checkBySKU(sku);
            }

            this.inviteToGroups(offer.partner);
        }
    }

    private keepMetalSupply(): void {
        const currencies = this.bot.inventoryManager.getInventory().getCurrencies();

        // let refined = currencies['5002;6'].length;
        let reclaimed = currencies['5001;6'].length;
        let scrap = currencies['5000;6'].length;

        const maxReclaimed = this.minimumReclaimed + this.combineThreshold;
        const maxScrap = this.minimumScrap + this.combineThreshold;
        const minReclaimed = this.minimumReclaimed;
        const minScrap = this.minimumScrap;

        let smeltReclaimed = 0;
        let smeltRefined = 0;
        let combineScrap = 0;
        let combineReclaimed = 0;

        if (reclaimed > maxReclaimed) {
            combineReclaimed = Math.ceil((reclaimed - maxReclaimed) / 3);
            // refined += combineReclaimed;
            reclaimed -= combineReclaimed * 3;
        } else if (minReclaimed > reclaimed) {
            smeltRefined = Math.ceil((minReclaimed - reclaimed) / 3);
            reclaimed += smeltRefined * 3;
            // refined -= smeltRefined;
        }

        if (scrap > maxScrap) {
            combineScrap = Math.ceil((scrap - maxScrap) / 3);
            reclaimed += combineScrap;
            scrap -= combineScrap * 3;
        } else if (minScrap > scrap) {
            smeltReclaimed = Math.ceil((minScrap - scrap) / 3);
            scrap += smeltReclaimed * 3;
            reclaimed -= smeltReclaimed;
        }

        // TODO: When smelting metal mark the item as being used, then we won't use it when sending offers

        for (let i = 0; i < combineScrap; i++) {
            this.bot.tf2gc.combineMetal(5000);
        }

        for (let i = 0; i < combineReclaimed; i++) {
            this.bot.tf2gc.combineMetal(5001);
        }

        for (let i = 0; i < smeltRefined; i++) {
            this.bot.tf2gc.smeltMetal(5002);
        }

        for (let i = 0; i < smeltReclaimed; i++) {
            this.bot.tf2gc.smeltMetal(5001);
        }
    }

    private sortInventory(): void {
        if (process.env.DISABLE_INVENTORY_SORT !== 'true') {
            this.bot.tf2gc.sortInventory(3);
        }
    }

    private inviteToGroups(steamID: SteamID | string): void {
        this.bot.groups.inviteToGroups(steamID, this.groups);
    }

    private checkFriendRequests(): void {
        if (!this.bot.client.myFriends) {
            return;
        }

        this.checkFriendsCount();

        for (const steamID64 in this.bot.client.myFriends) {
            if (!Object.prototype.hasOwnProperty.call(this.bot.client.myFriends, steamID64)) {
                continue;
            }

            const relation = this.bot.client.myFriends[steamID64];
            if (relation === SteamUser.EFriendRelationship.RequestRecipient) {
                this.respondToFriendRequest(steamID64);
            }
        }

        this.bot.getAdmins().forEach(steamID => {
            if (!this.bot.friends.isFriend(steamID)) {
                log.info('Not friends with admin ' + steamID + ', sending friend request...');
                this.bot.client.addFriend(steamID, function(err) {
                    if (err) {
                        log.warn('Failed to send friend request: ', err);
                    }
                });
            }
        });
    }

    private respondToFriendRequest(steamID: SteamID | string): void {
        const steamID64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();

        log.debug('Sending friend request to ' + steamID64 + '...');

        this.bot.client.addFriend(steamID, function(err) {
            if (err) {
                log.warn('Failed to send friend request to ' + steamID64 + ': ', err);
                return;
            }

            log.debug('Friend request has been sent / accepted');
        });
    }

    private onNewFriend(steamID: SteamID, tries = 0): void {
        if (tries === 0) {
            log.debug('Now friends with ' + steamID.getSteamID64());
        }

        const isAdmin = this.bot.isAdmin(steamID);

        setImmediate(() => {
            if (!this.bot.friends.isFriend(steamID)) {
                return;
            }

            const friend = this.bot.friends.getFriend(steamID);

            if (friend === null || friend.player_name === undefined) {
                tries++;

                if (tries >= 5) {
                    log.info('I am now friends with ' + steamID.getSteamID64());

                    this.bot.sendMessage(
                        steamID,
                        'Hi! If you don\'t know how things work, please type "!' +
                            (isAdmin ? 'help' : 'how2trade') +
                            '" :)'
                    );
                    return;
                }

                log.debug('Waiting for name');

                // Wait for friend info to be available
                setTimeout(() => {
                    this.onNewFriend(steamID, tries);
                }, exponentialBackoff(tries - 1, 200));
                return;
            }

            log.info('I am now friends with ' + friend.player_name + ' (' + steamID.getSteamID64() + ')');

            this.bot.sendMessage(
                steamID,
                'Hi ' +
                    friend.player_name +
                    '! If you don\'t know how things work, please type "!' +
                    (isAdmin ? 'help' : 'how2trade') +
                    '" :)'
            );
        });
    }

    private checkFriendsCount(steamIDToIgnore?: SteamID | string): void {
        log.debug('Checking friends count');
        const friends = this.bot.friends.getFriends();

        const friendslistBuffer = 20;

        const friendsToRemoveCount = friends.length + friendslistBuffer - this.bot.friends.maxFriends;

        log.debug('Friends to remove: ' + friendsToRemoveCount);

        if (friendsToRemoveCount > 0) {
            // We have friends to remove, find people with fewest trades and remove them
            const friendsWithTrades = this.bot.trades.getTradesWithPeople(friends);

            // Ignore friends to keep
            this.friendsToKeep.forEach(function(steamID) {
                delete friendsWithTrades[steamID];
            });

            if (steamIDToIgnore) {
                delete friendsWithTrades[steamIDToIgnore.toString()];
            }

            // Convert object into an array so it can be sorted
            const tradesWithPeople: { steamID: string; trades: number }[] = [];

            for (const steamID in friendsWithTrades) {
                if (!Object.prototype.hasOwnProperty.call(friendsWithTrades, steamID)) {
                    continue;
                }

                tradesWithPeople.push({ steamID: steamID, trades: friendsWithTrades[steamID] });
            }

            // Sorts people by trades and picks people with lowest amounts of trades
            const friendsToRemove = tradesWithPeople
                .sort((a, b) => a.trades - b.trades)
                .splice(0, friendsToRemoveCount);

            log.info('Cleaning up friendslist, removing ' + friendsToRemove.length + ' people...');

            friendsToRemove.forEach(element => {
                this.bot.sendMessage(
                    element.steamID,
                    'I am cleaning up my friendslist and you have been selected to be removed.'
                );
                this.bot.client.removeFriend(element.steamID);
            });
        }
    }

    private checkGroupInvites(): void {
        log.debug('Checking group invites');

        for (const groupID64 in this.bot.client.myGroups) {
            if (!Object.prototype.hasOwnProperty.call(this.bot.client.myGroups, groupID64)) {
                continue;
            }

            const relationship = this.bot.client.myGroups[groupID64];

            if (relationship === SteamUser.EClanRelationship.Invited) {
                this.bot.client.respondToGroupInvite(groupID64, false);
            }
        }

        this.groups.forEach(steamID => {
            if (
                this.bot.client.myGroups[steamID] !== SteamUser.EClanRelationship.Member &&
                this.bot.client.myGroups[steamID] !== SteamUser.EClanRelationship.Blocked
            ) {
                this.bot.community.getSteamGroup(new SteamID(steamID), function(err, group) {
                    if (err) {
                        log.warn('Failed to get group: ', err);
                        return;
                    }

                    log.info('Not member of group "' + group.name + ' ("' + steamID + '"), joining...');
                    group.join(function(err) {
                        if (err) {
                            log.warn('Failed to join group: ', err);
                        }
                    });
                });
            }
        });
    }

    onPollData(pollData: PollData): void {
        files.writeFile(paths.files.pollData, pollData, true).catch(function(err) {
            log.warn('Failed to save polldata: ', err);
        });
    }

    onPricelist(pricelist: Entry[]): void {
        log.debug('Pricelist changed');

        files
            .writeFile(
                paths.files.pricelist,
                pricelist.map(entry => entry.getJSON()),
                true
            )
            .catch(function(err) {
                log.warn('Failed to save pricelist: ', err);
            });
    }

    onPriceChange(sku: string, entry: Entry): void {
        this.bot.listings.checkBySKU(sku, entry);
    }

    onLoginThrottle(wait: number): void {
        log.warn('Waiting ' + wait + ' ms before trying to sign in...');
    }

    onTF2QueueCompleted(): void {
        log.debug('Queue finished');
        this.bot.client.gamesPlayed('tf2-automatic');
    }
};
