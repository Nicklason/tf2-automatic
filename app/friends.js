const SteamUser = require('steam-user');
const fs = require('graceful-fs');

const utils = require('./utils.js');

let Automatic, client, log, config;

const ALERTS_FILENAME = 'alerts.json';

let alerts = {};

exports.register = function(automatic) {
    Automatic = automatic;
    client = automatic.client;
    log = automatic.log;
    config = automatic.config;

    if (fs.existsSync(ALERTS_FILENAME)) {
        const data = utils.parseJSON(fs.readFileSync(ALERTS_FILENAME));
        if (data != null) {
            alerts = data;
        }
    }
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
    const userAlerts = alerts[steamID64];
    if (!userAlerts) {
        // Todo: get name of user
        client.chatMessage(steamID64, "Hi! If you're new here, type \"!help\" for all my commands :)");
        return;
    }

    alertUser(steamID64);
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

function alertUser(steamID64) {
    const userAlerts = alerts[steamID64];
    if (!userAlerts) {
        return;
    }

    /*{
        "type": "trade",
        "status": "declined",
        "reason": "you are missing 30.33 ref" || "\"Team Captain\" is or will be overstocked"
    }*/

    userAlerts.forEach(function(alert) {
        if (alert.type == "trade") {
            client.chatMessage(steamID64, "Your trade was " + alert.status + ". Reason: " + alert.reason + ".");
        }
    });

    removeAlerts(steamID64);
}

function newAlert(steamID64, alert) {
    let add = true;
    if (alerts[steamID64]) {
        add = false;
    }
    saveAlert(steamID64, alert);

    if (isFriend(steamID64)) {
        alertUser(steamID64);
        return;
    }

    if (add) {
        addFriend(steamID64);
    }
}

function removeAlerts(steamID64) {
    delete alerts[steamID64];

    fs.writeFile(ALERTS_FILENAME, JSON.stringify(alerts), function(err) {
        if (err) {
            log.warn("Error writing alert data: " + err);
        }
    });
}

function saveAlert(steamID64, alert) {
    let userAlerts = (alerts[steamID64] || []);
    userAlerts.push(alert);
    alerts[steamID64] = userAlerts;

    fs.writeFile(ALERTS_FILENAME, JSON.stringify(alerts), function(err) {
        if (err) {
            log.warn("Error writing alert data: " + err);
        }
    });
}

exports.alert = newAlert;