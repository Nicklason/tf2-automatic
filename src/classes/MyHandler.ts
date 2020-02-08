import Handler from './Handler';
import Bot from './Bot';
import { Entry, EntryData } from './Pricelist';
import Commands from './Commands';
import { UnknownDictionary } from '../types/common';

import SteamUser from 'steam-user';
import { TradeOffer, PollData } from 'steam-tradeoffer-manager';
import pluralize from 'pluralize';
import SteamID from 'steamid';
import request from '@nicklason/request-retry';

import log from '../lib/logger';
import * as files from '../lib/files';
import paths from '../resources/paths';

export = class MyHandler extends Handler {
    private readonly commands: Commands;

    recentlySentMessage: UnknownDictionary<number> = {};

    constructor(bot: Bot) {
        super(bot);

        this.commands = new Commands(bot);

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

    onCheckBanned(steamID: SteamID): Promise<boolean> {
        return Promise.all([this.isBptfBanned(steamID), this.isSteamRepBanned(steamID)]).then(([bptf, steamrep]) => {
            return bptf || steamrep;
        });
    }

    private isBptfBanned(steamID: SteamID | string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const steamID64 = steamID.toString();
            request(
                {
                    url: 'https://backpack.tf/api/users/info/v1',
                    qs: {
                        key: process.env.BPTF_API_KEY,
                        steamids: steamID64
                    },
                    gzip: true,
                    json: true
                },
                function(err, response, body) {
                    if (err) {
                        return reject(err);
                    }

                    const user = body.users[steamID64];

                    return resolve(user.bans && user.bans.all);
                }
            );
        });
    }

    private isSteamRepBanned(steamID: SteamID | string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            request(
                {
                    url: 'http://steamrep.com/api/beta4/reputation/' + steamID.toString(),
                    qs: {
                        json: 1
                    },
                    gzip: true,
                    json: true
                },
                function(err, response, body) {
                    if (err) {
                        return reject(err);
                    }

                    return resolve(body.steamrep.reputation.summary.toLowerCase().indexOf('scammer') !== -1);
                }
            );
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

    onPriceChange(): void {
        // TODO: Update backpack.tf listings
    }

    onLoginThrottle(wait: number): void {
        log.warn('Waiting ' + wait + ' ms before trying to sign in...');
    }

    onTF2QueueCompleted(): void {
        log.debug('Queue finished');
        this.bot.client.gamesPlayed('tf2-automatic');
    }
};
