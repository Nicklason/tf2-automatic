const SteamUser = require('steam-user');

const utils = require('./utils.js');

let Automatic, client, log, config;

exports.register = function(automatic) {
    Automatic = automatic;
    client = automatic.client;
    log = automatic.log;
    config = automatic.config;
};

exports.init = function() {
    client.on('friendRelationship', function(steamID, relationship) {
        const steamID64 = steamID.getSteamID64();
		if (relationship == SteamUser.Steam.EFriendRelationship.Friend) {
            log.info("I am now friends with " + steamID64);
			friendAddResponse(steamID64);
		} else if (relationship == SteamUser.Steam.EFriendRelationship.RequestRecipient) {
            log.info(steamID64 + " added me");
			addFriend(steamID64); // Add them back
		}
    });
    
    checkFriendRequests();
};

function addFriend(steamID64) {
    log.debug("Sending friend request to " + steamID64 + " or accepting their friend request...");
    client.addFriend(steamID64, function(err) {
		if (err) {
            log.warn("Failed to send a friend request (" + err.message + ")")
			log.debug(err.stack);
		}
	});
}

function getFriends() {
	const friends = [];
	for (const steamID64 in client.myFriends) {
		const relation = client.myFriends[steamID64];
		if (relation == SteamUser.Steam.EFriendRelationship.Friend) {
			friends.push(steamID64);
		}
	}

	return friends;
};

function checkFriendRequests() {
    if (!client.myFriends) {
        return;
    }

    for (const steamID64 in client.myFriends) {
        const relation = client.myFriends[steamID64];
        if (relation == SteamUser.Steam.EFriendRelationship.RequestRecipient) {
            addFriend(steamID64);
        }
    }
};

function friendAddResponse(steamID64) {
    // Todo: get name of user, check if they have added the bot before and give a different message
    client.chatMessage(steamID64, "Hi! If you are new here (or simply need a quick reminder on how to trade with me), use the commands \"!how2trade\" and \"!help\", and I will help you get started :)");
}

function isFriend(steamID64) {
	const friends = getFriends();
	for (let i = 0; i < friends.length; i++) {
		if (friends[i] == steamID64) {
			return true;
		}
	}
	return false;
};

function alert(steamID64, alert) {
    client.chatMessage(steamID64, "Your trade was " + alert.status + ". Reason: " + alert.reason + ".");
}

exports.alert = alert;
exports.isFriend = isFriend;