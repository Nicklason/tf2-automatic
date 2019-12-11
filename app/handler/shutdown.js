const log = require('lib/logger');
const files = require('utils/files');

module.exports = function (err, done) {
    checkFiles();

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
