import Handler from './Handler';
import Bot from './Bot';
import { EntryData } from './Pricelist';

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
    }

    onShutdown (): Promise<void> {
        return new Promise((resolve) => {
            // TODO: Remove listings

            // TODO: Wait for files to finish being written to

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
        
    }

    onLoginAttempts (attempts: number[]): void {

    }

    onNewTradeOffer (offer: TradeOffer, done: (action?: 'accept'|'decline') => void): void {

    }

    onTradeOfferChanged (offer: TradeOffer, oldState: number): void {
        
    }

    onPollData (pollData: PollData) {

    }

    onLoginThrottle (wait: number): void {
        log.warn('Waiting ' + wait + ' ms before trying to sign in...');
    }
}
