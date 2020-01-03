const SteamUser = require('steam-user');

const log = require('lib/logger');
const client = require('lib/client');
const listingManager = require('lib/bptf-listings');
const handlerManager = require('app/handler-manager');

const files = require('utils/files');

module.exports = function (err, done) {
    client.setPersona(SteamUser.EPersonaState.Snooze);

    listingManager.actions.create = [];

    if (listingManager.ready !== true || (listingManager.listings.length === 0 && listingManager._processingActions !== true)) {
        checkFiles();
        return;
    }

    listingManager.listings.forEach((listing) => listing.remove());

    listingManager.on('actions', onActions);

    function onActions (actions) {
        if (actions.remove.length === 0) {
            log.debug('Done removing listings');
            listingManager.removeListener('actions', onActions);
            checkFiles();
        } else {
            listingManager.removeListener('actions', onActions);
            listingManager.listings.forEach((listing) => listing.remove());
            listingManager.on('actions', onActions);
        }
    }

    function checkFiles (checks = 0) {
        if (!files.isWritingToFiles()) {
            // We are not writing to any files, stop the bot

            if (checks !== 0) {
                log.debug('Done writing files');
            }

            return done();
        }

        if (checks === 0) {
            log.warn('Writing to files, waiting for them to finish...');
        }

        // Files are still being written to, wait for them to be done
        setTimeout(function () {
            checkFiles(checks + 1);
        }, 100);
    }
};
