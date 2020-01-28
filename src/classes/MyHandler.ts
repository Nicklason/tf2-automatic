import Handler from './Handler';
import Bot from './Bot';
import { Entry, EntryData } from './Pricelist';

import SteamUser from 'steam-user';
import { TradeOffer, PollData } from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';

import log from '../lib/logger';
import * as files from '../lib/files';
import paths from '../resources/paths';

export = MyHandler;

class MyHandler extends Handler {
    constructor (bot: Bot) {
        super(bot);
    }

    onRun (): Promise<{ loginAttempts?: number[], pricelist?: EntryData[], loginKey?: string }> {
        return Promise.all([
            files.readFile(paths.files.loginKey, false),
            files.readFile(paths.files.pricelist, true),
            files.readFile(paths.files.loginAttempts, true)
        ]).then(function ([loginKey, pricelist, loginAttempts]) {
            return { loginKey, pricelist, loginAttempts };
        });
    }

    onReady (): void {
        log.info('tf2-automatic v' + process.env.BOT_VERSION + ' is ready! ' + pluralize('item', this.bot.pricelist.getLength(), true) + ' in pricelist, ' + pluralize('listing', this.bot.listingManager.listings.length, true) + ' on www.backpack.tf (cap: ' + this.bot.listingManager.cap + ')');

        this.bot.client.gamesPlayed('tf2-automatic');
        this.bot.client.setPersona(SteamUser.EPersonaState.Online);

        console.log(this.bot.inventoryManager.getInventory());
    }

    onShutdown (): Promise<void> {
        return new Promise(async (resolve) => {
            // TODO: Remove listings

            return resolve();
        });
    }

    onLoggedOn (): void {
        if (this.bot.isReady()) {
            this.bot.client.setPersona(SteamUser.EPersonaState.Online);
            this.bot.client.gamesPlayed('tf2-automatic');
        }
    }

    onLoginKey (loginKey: string): void {
        log.debug('New login key');

        files.writeFile(paths.files.loginKey, loginKey, false).catch(function (err) {
            log.warn('Failed to save login key: ', err);
        });
    }

    onLoginAttempts (attempts: number[]): void {
        log.debug('Login attempts changed');

        files.writeFile(paths.files.loginAttempts, attempts, true).catch(function (err) {
            log.warn('Failed to save login attempts: ', err);
        });
    }

    onNewTradeOffer (offer: TradeOffer): Promise<{
        action: 'accept'|'decline'|null,
        reason: string|null
    }> {
        offer.log('info', 'is being processed...');

        return Promise.resolve({ action: 'accept', reason: 'TEST' });
    }

    onTradeOfferChanged (offer: TradeOffer, oldState: number): void {
        
    }

    onPollData (pollData: PollData): void {
        files.writeFile(paths.files.pollData, pollData, true).catch(function (err) {
            log.warn('Failed to save polldata: ', err);
        });
    }

    onPricelist (pricelist: Entry[]): void {
        log.debug('Pricelist changed');
        // TODO: Emit pricelist change when the price of an item changes

        files.writeFile(paths.files.pricelist, pricelist, true).catch(function (err) {
            log.warn('Failed to save pricelist: ', err);
        });
    }

    onPriceChange (sku: string, entry: Entry): void {
        // TODO: Update backpack.tf listings
    }

    onLoginThrottle (wait: number): void {
        log.warn('Waiting ' + wait + ' ms before trying to sign in...');
    }
}
