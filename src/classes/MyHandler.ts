import Handler from './Handler';
import Bot from './Bot';
import { Entry, EntryData } from './Pricelist';
import Commands from './Commands';
import CartQueue from './CartQueue';
import { UnknownDictionary } from '../types/common';

import SteamUser from 'steam-user';
import TradeOfferManager, { TradeOffer, PollData } from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';
import SteamID from 'steamid';

import log from '../lib/logger';
import * as files from '../lib/files';
import paths from '../resources/paths';

export = class MyHandler extends Handler {
    private readonly commands: Commands;

    readonly cartQueue: CartQueue;

    private minimumScrap: number;

    private minimumReclaimed: number;

    private combineThreshhold: number;

    recentlySentMessage: UnknownDictionary<number> = {};

    constructor(bot: Bot) {
        super(bot);

        this.commands = new Commands(bot);
        this.cartQueue = new CartQueue(bot);

        this.minimumScrap = process.env.MINIMUM_SCRAP ? parseInt(process.env.MINIMUM_SCRAP) : 6;
        this.minimumReclaimed = process.env.MINIMUM_RECLAIMED ? parseInt(process.env.MINIMUM_RECLAIMED) : 6;
        this.combineThreshhold = process.env.COMBINE_THRESHOLD ? parseInt(process.env.COMBINE_THRESHOLD) : 6;

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

    onNewTradeOffer(
        offer: TradeOffer
    ): Promise<{
        action: 'accept' | 'decline' | null;
        reason: string | null;
    }> {
        return Promise.resolve({ action: null, reason: null });
    }

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
                    if (oldState === TradeOfferManager.ETradeOfferState.CreatedNeedsConfirmation) {
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
                        offer.summarize()
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

            offer.log('trade', 'has been accepted. Summary:\n' + offer.summarize());

            // Smelt / combine metal
            this.keepMetalSupply();

            // Sort inventory
            this.sortInventory();

            // Update listings
            const diff = offer.data('diff') || {};

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

        let refined = currencies['5002;6'].length;
        let reclaimed = currencies['5001;6'].length;
        let scrap = currencies['5000;6'].length;

        const maxReclaimed = this.minimumReclaimed + this.combineThreshhold;
        const maxScrap = this.minimumScrap + this.combineThreshhold;
        const minReclaimed = this.minimumReclaimed;
        const minScrap = this.minimumScrap;

        let smeltReclaimed = 0;
        let smeltRefined = 0;
        let combineScrap = 0;
        let combineReclaimed = 0;

        if (reclaimed > maxReclaimed) {
            combineReclaimed = Math.ceil((reclaimed - maxReclaimed) / 3);
            refined += combineReclaimed;
            reclaimed -= combineReclaimed * 3;
        } else if (minReclaimed > reclaimed) {
            smeltRefined = Math.ceil((minReclaimed - reclaimed) / 3);
            reclaimed += smeltRefined * 3;
            refined -= smeltRefined;
        }

        if (scrap > maxScrap) {
            combineScrap = Math.ceil((scrap - maxScrap) / 3);
            reclaimed += combineScrap;
            scrap -= combineScrap * 3;
        } else if (minScrap > scrap) {
            smeltReclaimed = Math.ceil((minReclaimed - reclaimed) / 3);
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
        const steamID64 = steamID.toString();

        throw new Error('Not implemented');
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
