/* eslint-disable @typescript-eslint/no-unused-vars */

import Bot from './Bot';
import { Entry, EntryData } from './Pricelist';

import SteamID from 'steamid';
import SteamTradeOfferManager from 'steam-tradeoffer-manager';

abstract class Handler {
    readonly bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

    get steamID(): SteamID {
        return this.bot.client.steamID;
    }

    /**
     * Called when the bot is first started
     */
    abstract onRun(): Promise<{
        loginAttempts?: number[];
        pricelist?: EntryData[];
        loginKey?: string;
    }>;

    /**
     * Called when the bot has started
     */
    abstract onReady(): void;

    /**
     * Called when the bot is stopping
     */
    abstract onShutdown(): Promise<void>;

    /**
     * Called when the bot has signed in to Steam
     */
    abstract onLoggedOn(): void;

    /**
     * Called when a new login key has been issued
     * @param loginKey
     */
    abstract onLoginKey(loginKey: string): void;

    /**
     * Called when a new trade offer is being processed
     * @param offer
     */
    abstract onNewTradeOffer(
        offer: SteamTradeOfferManager.TradeOffer
    ): Promise<{
        action: 'accept' | 'decline' | null;
        reason: string | null;
    }>;

    /**
     * Called when a new login attempt has been made
     * @param loginAttempts
     */
    abstract onLoginAttempts(loginAttempts: number[]): void;

    /**
     * Called when polldata changes
     * @param pollData
     */
    abstract onPollData(pollData: SteamTradeOfferManager.PollData): void;

    /**
     * Called when the pricelist updates
     * @param pricelist
     */
    abstract onPricelist(pricelist: Entry[]): void;

    /**
     * Called when the price of an item changes
     * @param sku
     * @param price
     */
    abstract onPriceChange(sku: string, price: Entry | null): void;

    /**
     * Called when login attempt has been throttled
     * @param wait Milliseconds that the bot will wait
     */
    onLoginThrottle(wait: number): void {
        // empty function
    }

    /**
     * Called when a friend message has been sent to the bot
     * @param steamID
     * @param message
     */
    onMessage(steamID: SteamID, message: string): void {
        // empty function
    }

    /**
     * Called when the relation to an account changes
     * @param steamID
     * @param relationship
     */
    onFriendRelationship(steamID: SteamID, relationship: number): void {
        // empty function
    }

    /**
     * Called when the relation to a group changes
     * @param steamID
     * @param relationship
     */
    onGroupRelationship(steamID: SteamID, relationship: number): void {
        // empty function
    }

    /**
     * Called when the state of a trade offer changes
     * @param offer
     * @param oldState
     */
    onTradeOfferChanged(offer: SteamTradeOfferManager.TradeOffer, oldState: number): void {
        // empty function
    }

    /**
     * Called when a crafting recipe has been completed
     */
    onCraftingCompleted(): void {
        // empty function
    }

    /**
     * Called when an item has been used
     */
    onUseCompleted(): void {
        // empty function
    }

    /**
     * Called when an item has been deleted
     */
    onDeleteCompleted(): void {
        // empty function
    }

    /**
     * Called when the TF2 GC job queue has finished
     */
    onTF2QueueCompleted(): void {
        // empty function
    }

    /**
     * Called when bptf auth details has been retrieved
     * @param auth
     */
    onBptfAuth(auth: { apiKey: string; accessToken: string }): void {
        // empty function
    }

    /**
     * Called when a heartbeat has been sent to bptf
     * @param bumped
     */
    onHeartbeat(bumped: number): void {
        // empty function
    }
}

export = Handler;
