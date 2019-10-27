const client = require('lib/client');
const community = require('lib/community');

module.exports = function (callback) {
    if (community.steamID !== undefined) {
        // We are already signed in to steamcommunity
        return callback(null);
    }

    // Listen for webSession event
    client.on('webSession', webSessionEvent);

    // Start timeout that will return an error if we have not gotten the websession within 10 seconds
    const timeout = setTimeout(function () {
        if (community.steamID !== undefined) {
            return callback(null);
        } else {
            // We are not signed in, return error
            return callback(new Error('Could not sign in to steamcommunity'));
        }
    }, 10000);

    function webSessionEvent () {
        // Signed in, stop timeout and return
        clearTimeout(timeout);

        callback(null);
    }
};
