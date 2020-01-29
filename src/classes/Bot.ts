import InventoryManager from './InventoryManager';
import Pricelist from './Pricelist';
import Handler from './Handler';
import Friends from './Friends';
import Trades from './Trades';
import Inventory from './Inventory';
import BotManager from './BotManager';
import MyHandler from './MyHandler';

import SteamID from 'steamid';
import SteamUser from 'steam-user';
import SteamTradeOfferManager from 'steam-tradeoffer-manager';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import ListingManager from 'bptf-listings';
import SchemaManager from 'tf2-schema';
import BptfLogin from 'bptf-login';
import moment from 'moment';
import async from 'async';

import log from '../lib/logger';

export = class Bot {
    // Modules and classes
    readonly botManager: BotManager;

    readonly schema: SchemaManager.Schema;

    readonly socket: SocketIOClient.Socket;

    readonly bptf: BptfLogin;

    readonly client: SteamUser;

    readonly manager: SteamTradeOfferManager;

    readonly community: SteamCommunity;

    readonly listingManager: ListingManager;

    readonly friends: Friends;

    readonly trades: Trades;

    readonly handler: Handler;

    readonly inventoryManager: InventoryManager;

    readonly pricelist: Pricelist;

    // Settings
    private readonly maxLoginAttemptsWithinPeriod: number = 3;

    private readonly loginPeriodTime: number = 60 * 1000;

    // Values
    private sessionReplaceCount = 0;

    private consecutiveSteamGuardCodesWrong = 0;

    private timeOffset: number = null;

    private loginAttempts: moment.Moment[] = [];

    private ready = false;

    constructor(botManager: BotManager) {
        this.botManager = botManager;

        this.schema = this.botManager.getSchema();
        this.socket = this.botManager.getSocket();

        this.client = new SteamUser();
        this.community = new SteamCommunity();
        this.manager = new SteamTradeOfferManager({
            steam: this.client,
            community: this.community,
            language: 'en',
            pollInterval: -1,
            cancelTime: 5 * 60 * 1000,
            pendingCancelTime: 10 * 1000
        });

        this.listingManager = new ListingManager({
            token: process.env.BPTF_ACCESS_TOKEN,
            batchSize: 25,
            waitTime: 100,
            schema: this.schema
        });
        this.bptf = new BptfLogin();

        this.friends = new Friends(this);
        this.trades = new Trades(this);

        this.handler = new MyHandler(this);

        this.pricelist = new Pricelist(this.schema, this.socket);
        this.inventoryManager = new InventoryManager(this.pricelist);

        this.addListener(this.client, 'loggedOn', this.handler.onLoggedOn, this.handler, true);
        this.addListener(this.client, 'friendMessage', this.onMessage, this, true);
        this.addListener(this.client, 'friendRelationship', this.handler.onFriendRelationship, this, true);
        this.addListener(this.client, 'groupRelationship', this.handler.onGroupRelationship, this, true);
        this.addListener(this.client, 'webSession', this.onWebSession, this, false);
        this.addListener(this.client, 'steamGuard', this.onSteamGuard, this, false);
        this.addListener(this.client, 'loginKey', this.handler.onLoginKey, this.handler, true);
        this.addListener(this.client, 'error', this.onError, this, false);

        this.addListener(this.community, 'sessionExpired', this.onSessionExpired, this, false);
        this.addListener(this.community, 'confKeyNeeded', this.onConfKeyNeeded, this, false);

        this.addListener(this.manager, 'pollData', this.handler.onPollData, this.handler, true);
        this.addListener(this.manager, 'newOffer', this.trades.onNewOffer, this.trades, true);
        this.addListener(this.manager, 'sentOfferChanged', this.trades.onOfferChanged, this.trades, true);
        this.addListener(this.manager, 'receivedOfferChanged', this.trades.onOfferChanged, this.trades, true);
        this.addListener(this.manager, 'offerList', this.trades.onOfferList, this.trades, true);

        this.addListener(this.listingManager, 'heartbeat', this.handler.onHeartbeat, this, true);

        this.addListener(this.pricelist, 'pricelist', this.handler.onPricelist, this.pricelist, true);
        this.addListener(this.pricelist, 'price', this.handler.onPriceChange, this.pricelist, true);
    }

    getHandler(): Handler {
        return this.handler;
    }

    setReady(): void {
        this.ready = true;
    }

    isReady(): boolean {
        return this.ready;
    }

    private addListener(emitter: any, event: string, listener: Function, context: any, checkCanEmit: boolean): void {
        emitter.on(event, (...args: any[]) => {
            if (!checkCanEmit || this.canSendEvents()) {
                listener.call(context, ...args);
            }
        });
    }

    start(): Promise<void> {
        let data;
        let cookies;

        return new Promise((resolve, reject) => {
            async.eachSeries(
                [
                    (callback): void => {
                        log.debug('Calling onRun');
                        this.handler.onRun().asCallback(function(err, v) {
                            if (err) {
                                return callback(err);
                            }

                            data = v;

                            return callback(null);
                        });
                    },
                    (callback): void => {
                        log.info('Setting up pricelist...');
                        this.pricelist
                            .setPricelist(data.pricelist === undefined ? [] : data.pricelist)
                            .asCallback(callback);
                    },
                    (callback): void => {
                        if (process.env.SKIP_ACCOUNT_LIMITATIONS === 'true') {
                            return callback(null);
                        }

                        log.verbose('Checking account limitations...');
                        this.getAccountLimitations().asCallback(function(err, limitations) {
                            if (err) {
                                return callback(err);
                            }

                            if (limitations.limited) {
                                throw new Error('The account is limited');
                            } else if (limitations.communityBanned) {
                                throw new Error('The account is community banned');
                            } else if (limitations.locked) {
                                throw new Error('The account is locked');
                            }

                            log.verbose('Account limitations check completed!');

                            return callback(null);
                        });
                    },
                    (callback): void => {
                        log.info('Signing in to Steam...');

                        let lastLoginFailed = false;

                        const loginResponse = (err): void => {
                            if (err) {
                                if (
                                    !lastLoginFailed &&
                                    err.eresult !== SteamUser.EFriendRelationship.RateLimitExceeded &&
                                    err.eresult !== SteamUser.EFriendRelationship.InvalidPassword
                                ) {
                                    lastLoginFailed = true;
                                    // Try and sign in without login key
                                    log.warn('Failed to sign in to Steam, retrying without login key...');
                                    this.login(null).asCallback(loginResponse);
                                    return;
                                } else {
                                    log.warn('Failed to sign in to Steam: ', err);
                                    return callback(err);
                                }
                            }

                            log.info('Signed in to Steam!');

                            // We now know our SteamID, but we still don't have our Steam API key
                            const inventory = new Inventory(this.client.steamID, this.manager, this.schema);
                            this.inventoryManager.setInventory(inventory);

                            return callback(null);
                        };

                        this.login(data.loginKey || null).asCallback(loginResponse);
                    },
                    (callback): void => {
                        log.debug('Waiting for web session');
                        this.getWebSession().asCallback((err, v) => {
                            if (err) {
                                return callback(err);
                            }

                            cookies = v;

                            this.bptf.setCookies(cookies);

                            return callback(null);
                        });
                    },
                    (callback): void => {
                        if (process.env.BPTF_API_KEY && process.env.BPTF_ACCESS_TOKEN) {
                            return callback(null);
                        }

                        log.warn(
                            'You have not included the backpack.tf API key or access token in the environment variables'
                        );

                        this.getBptfAPICredentials().asCallback(err => {
                            if (err) {
                                return callback(err);
                            }

                            return callback(null);
                        });
                    },
                    (callback): void => {
                        log.info('Initializing bptf-listings...');
                        async.parallel(
                            [
                                (callback): void => {
                                    this.inventoryManager
                                        .getInventory()
                                        .fetch()
                                        .asCallback(callback);
                                },
                                (callback): void => {
                                    this.listingManager.token = process.env.BPTF_ACCESS_TOKEN;
                                    this.listingManager.steamid = this.client.steamID;

                                    this.listingManager.init(callback);
                                },
                                (callback): void => {
                                    if (process.env.SKIP_UPDATE_PROFILE_SETTINGS !== 'true') {
                                        return callback(null);
                                    }

                                    this.community.profileSettings(
                                        {
                                            profile: 3,
                                            inventory: 3,
                                            inventoryGifts: false
                                        },
                                        callback
                                    );
                                }
                            ],
                            callback
                        );
                    },
                    (callback): void => {
                        log.info('Getting Steam API key...');
                        this.setCookies(cookies).asCallback(callback);
                    },
                    (callback): void => {
                        log.debug('Getting max friends...');
                        this.friends.getMaxFriends().asCallback(callback);
                    }
                ],
                (item, callback) => {
                    if (this.botManager.isStopping()) {
                        // Shutdown is requested, stop the bot
                        this.botManager.stop(null, false, false);
                        return;
                    }

                    item(callback);
                },
                err => {
                    if (err) {
                        return reject(err);
                    }

                    this.manager.pollInterval = 1000;

                    this.setReady();
                    this.handler.onReady();

                    this.manager.doPoll();

                    // this.startVersionChecker();

                    return resolve();
                }
            );
        });
    }

    setCookies(cookies: string[]): Promise<void> {
        this.bptf.setCookies(cookies);

        this.community.setCookies(cookies);

        return new Promise((resolve, reject) => {
            this.manager.setCookies(cookies, function(err) {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    }

    getWebSession(eventOnly = false): Promise<string[]> {
        return new Promise((resolve, reject) => {
            if (!eventOnly) {
                const cookies = this.getCookies();
                if (cookies.length !== 0) {
                    return resolve(cookies);
                }
            }

            this.client.once('webSession', webSessionEvent);

            const timeout = setTimeout(() => {
                this.client.removeListener('webSession', webSessionEvent);
                return reject(new Error('Could not sign in to steamcommunity'));
            }, 10000);

            function webSessionEvent(sessionID: string, cookies: string[]): void {
                clearTimeout(timeout);

                resolve(cookies);
            }
        });
    }

    getAccountLimitations(): Promise<{
        limited: boolean;
        communityBanned: boolean;
        locked: boolean;
        canInviteFriends: boolean;
    }> {
        return new Promise((resolve, reject) => {
            if (this.client.limitations !== null) {
                return resolve(this.client.limitations);
            }

            this.client.once('accountLimitations', accountLimitationsEvent);

            const timeout = setTimeout(() => {
                this.client.removeListener('accountLimitations', accountLimitationsEvent);
                return reject(new Error('Could not get account limitations'));
            }, 10000);

            function accountLimitationsEvent(
                limited: boolean,
                communityBanned: boolean,
                locked: boolean,
                canInviteFriends: boolean
            ): void {
                clearTimeout(timeout);

                resolve({ limited, communityBanned, locked, canInviteFriends });
            }
        });
    }

    private getCookies(): string[] {
        return this.community._jar
            .getCookies('https://steamcommunity.com')
            .filter(cookie => ['sessionid', 'steamLogin', 'steamLoginSecure'].indexOf(cookie.key) !== -1)
            .map(function(cookie) {
                return `${cookie.key}=${cookie.value}`;
            });
    }

    private async getBptfAPICredentials(): Promise<{
        apiKey: string;
        accessToken: string;
    }> {
        await this.bptfLogin();

        log.verbose('Getting API key and access token...');

        const apiKey = await this.getOrCreateBptfAPIKey();
        const accessToken = await this.getBptfAccessToken();

        log.verbose('Got backpack.tf API key and access token!');

        process.env.BPTF_API_KEY = apiKey;
        process.env.BPTF_ACCESS_TOKEN = accessToken;

        this.handler.onBptfAuth({ apiKey, accessToken });

        return { apiKey, accessToken };
    }

    private getBptfAccessToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.bptf.getAccessToken(function(err, accessToken) {
                if (err) {
                    return reject(err);
                }

                return resolve(accessToken);
            });
        });
    }

    private getOrCreateBptfAPIKey(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.bptf.getAPIKey((err, apiKey) => {
                if (err) {
                    return reject(err);
                }

                if (apiKey !== null) {
                    return resolve(apiKey);
                }

                log.verbose("You don't have a backpack.tf API key, creating one...");

                this.bptf.generateAPIKey(
                    'http://localhost',
                    'Check if an account is banned on backpack.tf',
                    (err, apiKey) => {
                        if (err) {
                            return reject(err);
                        }

                        return resolve(apiKey);
                    }
                );
            });
        });
    }

    private bptfLogin(): Promise<void> {
        return new Promise((resolve, reject) => {
            // @ts-ignore
            if (this.bptf.loggedIn) {
                return resolve();
            }

            log.verbose('Signing in to backpack.tf...');

            this.bptf.login(err => {
                if (err) {
                    return reject(err);
                }

                log.verbose('Logged in to backpack.tf!');

                // @ts-ignore
                this.bptf.loggedIn = true;

                return resolve();
            });
        });
    }

    login(loginKey?: string): Promise<void> {
        log.debug('Starting login attempt', {
            loginKey: loginKey,
            private: true
        });

        const wait = this.loginWait();

        if (wait !== 0) {
            this.handler.onLoginThrottle(wait);
        }

        return new Promise((resolve, reject) => {
            Promise.delay(wait).then(() => {
                const listeners = this.client.listeners('error');

                this.client.removeAllListeners('error');

                const details: {
                    accountName: string;
                    logonID: number;
                    rememberPassword: boolean;
                    password?: string;
                    loginKey?: string;
                } = {
                    accountName: process.env.STEAM_ACCOUNT_NAME,
                    logonID: 69420,
                    rememberPassword: true
                };

                if (loginKey) {
                    log.debug('Signing in using login key');
                    details.loginKey = loginKey;
                } else {
                    log.debug('Signing in using password');
                    details.password = process.env.STEAM_PASSWORD;
                }

                this.newLoginAttempt();

                this.client.logOn(details);

                const gotEvent = (): void => {
                    listeners.forEach(listener => {
                        // @ts-ignore
                        this.client.on('error', listener);
                    });
                };

                const loggedOnEvent = (): void => {
                    gotEvent();

                    this.client.removeListener('error', errorEvent);
                    clearTimeout(timeout);

                    resolve(null);
                };

                const errorEvent = (err: Error): void => {
                    gotEvent();

                    this.client.removeListener('loggedOn', loggedOnEvent);
                    clearTimeout(timeout);

                    log.debug('Failed to sign in to Steam: ', err);

                    reject(err);
                };

                const timeout = setTimeout(() => {
                    gotEvent();

                    this.client.removeListener('loggedOn', loggedOnEvent);
                    this.client.removeListener('error', errorEvent);

                    log.debug('Did not get login response from Steam');

                    reject(new Error('Did not get login response from Steam'));
                }, 60 * 1000);

                this.client.once('loggedOn', loggedOnEvent);
                this.client.once('error', errorEvent);
            });
        });
    }

    sendMessage(steamID: SteamID | string, message: string): void {
        const steamID64 = steamID.toString();

        const friend = this.friends.getFriend(steamID64);

        this.client.chatMessage(steamID, message);

        if (friend === null) {
            log.info('Message sent to ' + steamID + ': ' + message);
        } else {
            log.info('Message sent to ' + friend.player_name + ' (' + steamID64 + '): ' + message);
        }
    }

    private canSendEvents(): boolean {
        return this.ready || !this.botManager.isStopping();
    }

    private onMessage(steamID: SteamID, message: string): void {
        if (message.startsWith('[tradeoffer sender=') && message.endsWith('[/tradeoffer]')) {
            return;
        }

        this.handler.onMessage(steamID, message);
    }

    private onWebSession(sessionID: string, cookies: string[]): void {
        log.debug('New web session');

        this.setCookies(cookies);
    }

    private onSessionExpired(): void {
        log.debug('Web session has expired');

        this.client.webLogOn();
    }

    private onConfKeyNeeded(tag: string, callback: (err: Error | null, time: number, confKey: string) => void): void {
        log.debug('Conf key needed');

        this.getTimeOffset().asCallback(function(err, offset) {
            const time = SteamTotp.time(offset);
            const confKey = SteamTotp.getConfirmationKey(process.env.STEAM_IDENTITY_SECRET, time, tag);

            return callback(null, time, confKey);
        });
    }

    private onSteamGuard(domain: string, callback: (authCode: string) => void, lastCodeWrong: boolean): void {
        log.debug('Steam guard code requested');

        if (lastCodeWrong === false) {
            this.consecutiveSteamGuardCodesWrong = 0;
        } else {
            this.consecutiveSteamGuardCodesWrong++;
        }

        if (this.consecutiveSteamGuardCodesWrong > 1) {
            // Too many logins will trigger this error because steam returns TwoFactorCodeMismatch
            throw new Error('Too many wrong Steam Guard codes');
        }

        const wait = this.loginWait();

        if (wait !== 0) {
            this.handler.onLoginThrottle(wait);
        }

        Promise.delay(wait)
            .then(this.generateAuthCode)
            .then(authCode => {
                this.newLoginAttempt();

                callback(authCode);
            });
    }

    private onError(err: Error): void {
        // @ts-ignore
        if (err.eresult === SteamUser.EResult.LoggedInElsewhere) {
            log.warn('Signed in elsewhere, stopping the bot...');
            this.botManager.stop(err, false, true);
            // @ts-ignore
        } else if (err.eresult === SteamUser.EResult.LogonSessionReplaced) {
            this.sessionReplaceCount++;

            if (this.sessionReplaceCount > 0) {
                log.warn('Detected login session replace loop, stopping bot...');
                this.botManager.stop(err, false, true);
                return;
            }

            log.warn('Login session replaced, relogging...');

            this.login().asCallback(function(err) {
                if (err) {
                    throw err;
                }
            });
        } else {
            throw err;
        }
    }

    private async generateAuthCode(): Promise<string> {
        let offset: number;
        try {
            offset = await this.getTimeOffset();
        } catch (err) {
            // ignore error
        }

        return SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET, offset);
    }

    private getTimeOffset(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (this.timeOffset !== null) {
                return resolve(this.timeOffset);
            }

            SteamTotp.getTimeOffset((err, offset) => {
                if (err) {
                    return reject(err);
                }

                this.timeOffset = offset;

                resolve(offset);
            });
        });
    }

    private loginWait(): number {
        const attemptsWithinPeriod = this.getLoginAttemptsWithinPeriod();

        let wait = 0;

        if (attemptsWithinPeriod >= this.maxLoginAttemptsWithinPeriod) {
            const oldest = attemptsWithinPeriod[0];

            // Time when we can make login attempt
            const timeCanAttempt = moment().add(this.loginPeriodTime, 'milliseconds');

            // Get milliseconds till oldest till timeCanAttempt
            wait = oldest.diff(timeCanAttempt, 'milliseconds');
        }

        if (wait === 0 && this.consecutiveSteamGuardCodesWrong > 1) {
            // 30000 ms wait for TwoFactorCodeMismatch is enough to not get ratelimited
            return 30000 * this.consecutiveSteamGuardCodesWrong;
        }

        return wait;
    }

    private getLoginAttemptsWithinPeriod(): number {
        const now = moment();

        return this.loginAttempts.filter(attempt => now.diff(attempt, 'milliseconds') < this.loginPeriodTime).length;
    }

    private newLoginAttempt(): void {
        const now = moment();

        // Clean up old login attempts
        this.loginAttempts = this.loginAttempts.filter(
            attempt => now.diff(attempt, 'milliseconds') < this.loginPeriodTime
        );

        this.loginAttempts.push(now);

        this.handler.onLoginAttempts(this.loginAttempts.map(attempt => attempt.unix()));
    }
};
