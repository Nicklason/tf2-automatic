exports.register = function (automatic) {
    Automatic = automatic;
    log = Automatic.log;
    config = Automatic.config;
    community = Automatic.community;
};

exports.accept = function(id, callback) {
    log.debug('Accepting confirmation for object with id #' + id);
    community.acceptConfirmationForObject(config.getAccount().identity_secret, id, function(err) {
        if (err) {
            log.debug('An error occurred while attempting to accept confirmation: ' + err.message + '.');
        }
        if (callback) {
            callback(err);
        }
    });
};