require('module-alias/register');

const dotenv = require('dotenv');
dotenv.config();

const path = require('path');

const EconItem = require(path.join(__dirname, './node_modules/steam-tradeoffer-manager/lib/classes/EconItem.js'));
const CEconItem = require(path.join(__dirname, './node_modules/steamcommunity/classes/CEconItem.js'));

['hasDescription', 'getAction', 'getTag', 'getItem', 'getSKU', 'getName'].forEach(function (v) {
    const func = require('utils/item/' + v);
    EconItem.prototype[v] = func;
    CEconItem.prototype[v] = func;
});

const SteamUser = require('steam-user');

const client = require('lib/client');
const schemaManager = require('lib/tf2-schema');
const listingManager = require('lib/bptf-listings');

const handlerManager = require('app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

handler.onRun(function (opts) {
    opts = opts || {};

    schemaManager.init(function (err) {
        if (err) {
            throw err;
        }

        const loginKey = opts.loginKey || null;

        listingManager.schema = schemaManager.schema;

        let lastLoginFailed = false;

        const login = require('app/login');

        // Perform login
        login(loginKey, loginResponse);

        function loginResponse (err) {
            if (err) {
                if (!lastLoginFailed && err.eresult !== SteamUser.EFriendRelationship.RateLimitExceeded && err.eresult !== SteamUser.EFriendRelationship.InvalidPassword) {
                    lastLoginFailed = true;
                    // Try and sign in without login key
                    login(null, loginResponse);
                } else {
                    handler.onLoginFailure(err);
                }
                return;
            }

            handler.onLoginSuccessful();

            listingManager.steamid = client.steamID;

            listingManager.init(function (err) {
                if (err) {
                    throw err;
                }

                handler.onReady();
            });
        }
    });
});
