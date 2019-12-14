const log = require('lib/logger');
const listingManager = require('lib/bptf-listings');

const files = require('utils/files');

module.exports = function (err, done) {
    listingManager.actions.create = [];

    if (listingManager.ready !== true || (listingManager.listings.length === 0 && listingManager._processingActions !== true)) {
        checkFiles();
        return;
    }

    log.info('Removing listings before exiting...');

    listingManager.listings.forEach((listing) => listing.remove());

    listingManager.on('actions', onActions);

    function onActions (actions) {
        if (actions.remove.length === 0) {
            log.info('Done removing listings');
            listingManager.removeListener('actions', onActions);
            checkFiles();
        } else {
            listingManager.listings.forEach((listing) => listing.remove());
        }
    }

    function checkFiles (checks = 0) {
        if (!files.isWritingToFiles()) {
            // We are not writing to any files, stop the bot

            if (checks !== 0) {
                log.info('Done writing files');
            }

            return done();
        }

        if (checks === 0) {
            log.warn('Still writing to files, waiting for them to finish...');
        }

        // Files are still being written to, wait for them to be done
        setTimeout(function () {
            checkFiles(checks + 1);
        }, 100);
    }
};
