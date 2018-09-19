let community;
let config;
let log;

exports.register = function (automatic) {
    log = automatic.log;
    config = automatic.config;
    community = automatic.community;
};

exports.accept = function (id, callback) {
    log.debug('Accepting confirmation for object with id #' + id);
    community.acceptConfirmationForObject(config.getAccount().identity_secret, id, function (err) {
        if (err) {
            log.debug('An error occurred while attempting to accept confirmation: ' + err.message + '.');
        }
        if (callback) {
            callback(err);
        }
    });
};
