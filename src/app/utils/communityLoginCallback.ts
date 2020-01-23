const client = require('../../lib/client');
const community = require('../../lib/community');

/**
 * Waits for webSession event to fire
 * @param eventOnly If you only look for the event
 * @param callback
 */
export = function (eventOnly: boolean, callback: (err?: Error, cookies?: string[]) => void): void {
    if (!eventOnly) {
        const cookies = getCookies();
        if (cookies.length !== 0) {
            // We are already signed in to steamcommunity
            callback(null, cookies);
            return;
        }
    }

    // Listen for webSession event
    client.once('webSession', webSessionEvent);

    // Start timeout that will return an error if we have not gotten the websession within 10 seconds
    const timeout = setTimeout(function () {
        // We are not signed in, return error
        client.removeListener('webSession', webSessionEvent);
        return callback(new Error('Could not sign in to steamcommunity'));
    }, 10000);

    function webSessionEvent (sessionID: string, cookies: string[]) {
        // Signed in, stop timeout and return
        clearTimeout(timeout);

        callback(null, cookies);
    }
};

function getCookies (): string[] {
    return community._jar.getCookies('https://steamcommunity.com').filter((cookie) => ['sessionid', 'steamLogin', 'steamLoginSecure'].indexOf(cookie.key) !== -1).map(function (cookie) {
        return `${cookie.key}=${cookie.value}`;
    });
}
