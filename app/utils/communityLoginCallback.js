const client = require('lib/client');
const community = require('lib/community');

module.exports = function (callback) {
    const cookies = getCookies();
    if (cookies.length !== 0) {
        // We are already signed in to steamcommunity
        return callback(null, cookies);
    }

    // Listen for webSession event
    client.on('webSession', webSessionEvent);

    // Start timeout that will return an error if we have not gotten the websession within 10 seconds
    const timeout = setTimeout(function () {
        // We are not signed in, return error
        return callback(new Error('Could not sign in to steamcommunity'));
    }, 10000);

    function webSessionEvent (sessionID, cookies) {
        // Signed in, stop timeout and return
        clearTimeout(timeout);

        callback(null, cookies);
    }
};

function getCookies () {
    return community._jar.getCookies('https://steamcommunity.com').filter((cookie) => ['sessionid', 'steamLogin', 'steamLoginSecure'].indexOf(cookie.key) !== -1).map(function (cookie) {
        return `${cookie.key}=${cookie.value}`;
    });
}
