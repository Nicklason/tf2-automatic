import client from '../../lib/client';

/**
 * Waits for accountLimitations event to fire
 * @param {function} callback
 */
export default function (callback) {
    if (client.limitations !== null) {
        callback(null, client.limitations);
        return;
    }

    // Listen for limitations event
    client.once('accountLimitations', accountLimitationsEvent);

    // Start timeout that will return an error if we have not gotten the websession within 10 seconds
    const timeout = setTimeout(function () {
        // We are not signed in, return error
        client.removeListener('accountLimitations', accountLimitationsEvent);
        return callback(new Error('Could not get account limitations'));
    }, 10000);

    function accountLimitationsEvent (limited, communityBanned, locked, canInviteFriends) {
        clearTimeout(timeout);

        callback(null, {
            limited, communityBanned, locked, canInviteFriends
        });
    }
};
