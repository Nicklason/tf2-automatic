require('module-alias/register');

const dotenv = require('dotenv');
dotenv.config();

const client = require('lib/client');
const schemaManager = require('lib/tf2-schema');
const listingManager = require('lib/bptf-listings');

const handlerManager = require('app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

schemaManager.init(function (err) {
    if (err) {
        throw err;
    }

    listingManager.schema = schemaManager.schema;

    handler.onRun(function () {
        require('app/login')(function (err) {
            if (err) {
                handler.onLoginFailure(err);
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
        });
    });
});
