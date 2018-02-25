const utils = require('./utils.js');

let Automatic, client, log, config, Inventory, Prices;

exports.register = function (automatic) {
    client = automatic.client;
    log = automatic.log;
    config = automatic.config;
    Inventory = automatic.inventory;
    Prices = automatic.prices;
    Automatic = automatic;
};

exports.init = function() {
    client.on('friendMessage', friendMessage);
}

function friendMessage(steamID, message) {
    message = message.trim();
    let steamID64 = steamID.getSteamID64();
    log.info('Message from ' + steamID64 + ': ' + message);
    const command = isCommand(message);
    if (command == "help") {
        let reply = "Here's a list of all my commands: !help, !stock, !price";
        if (Automatic.isOwner(steamID64)) {
            reply += ", !add, !remove, !update";
        }
        client.chatMessage(steamID64, reply);
    } else if (command == "stock") {
        const summary = Inventory.summary();

        let parsed = [];
        // Convert object to array so we can easily sort it.
        for (var name in summary) {
            if (name == "Mann Co. Supply Crate Key" || name == "Refined Metal" || name == "Reclaimed Metal" || name == "Scrap Metal") { continue; }
            parsed.push({ name: name, amount: summary[name] });
        }
        // Sort the array.
        parsed.sort(function (a, b) {
            if (a.amount == b.amount) {
                // Sort alphabetically if the amounts are the same.
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
            }
            return b.amount - a.amount; // High -> Low
        });

        // We want to display the stock of metals and keys at the top.
        const pure = [
            { name: "Mann Co. Supply Crate Key", amount: Inventory.getAmount("Mann Co. Supply Crate Key") },
            { name: "Refined Metal", amount: Inventory.getAmount("Refined Metal") },
            { name: "Reclaimed Metal", amount: Inventory.getAmount("Reclaimed Metal") },
            { name: "Scrap Metal", amount: Inventory.getAmount("Scrap Metal") }
        ];

        // Add the array of pure to the other items.
        parsed.splice(0, 0, ...pure);

        let stock = [],
            left = 0;
        for (var i = 0; i < parsed.length; i++) {
            // We will max show 20 different items in the message, we don't want it to be too big.
            if (stock.length > 20) {
                left += parsed[i].amount;
            } else {
                stock.push(parsed[i].name + ": " + parsed[i].amount);
            }
        }
        let reply = "Here's a list of all the items that I have in my inventory:\n" + stock.join(", \n");
        if (left > 0) {
            reply += ",\nand " + left + " other " + utils.plural("item", left);
        }
        reply += ".";
        client.chatMessage(steamID64, reply);
    } else if (command == "price") {
        const name = message.substr(message.toLowerCase().indexOf("price") + 6);
        if (name == "") {
            client.chatMessage(steamID64, "You forgot to add a name. Here's an example: \"!price Team Captain\"");
            return;
        }

        const match = Prices.findMatch(name);
        if (match == null) {
            client.chatMessage(steamID64, "I could not find any items in my pricelist that contains \"" + name + "\", I might not be trading the item you are looking for.");
            return;
        } else if (Array.isArray(match)) {
            const n = match.length;
            if (match.length > 20) {
                match = match.splice(0, 20);
            }
            let reply = "I found " + n + " " + utils.plural("item", n) + " that contains \"" + name + "\". Try with one of the items shown below:\n" + match.join(',\n');
            if (n > match.lenght) {
                const other = n - match.length;
                reply += ",\nand " + other + " other " + utils.plural("item", other) + ".";
            }

            client.chatMessage(steamID64, reply);
            return;
        }

        const buy = utils.currencyAsText(match.price.buy),
            sell = utils.currencyAsText(match.price.sell);
        
        client.chatMessage(steamID64, "I am buying one " + match.item.name + " for " + buy + " and selling for " + sell + ".");
    } else if (command == "message" && true == false) {
        if (Automatic.isOwner(steamID64)) {
            client.chatMessage(steamID64, "You can't message yourself.");
            return;
        }
        const owners = config.get().owners;
        if (!owners || owners.length == 0) {
            client.chatMessage(steamID64, "Sorry, but there are noone that you can message :(");
            return;
        }

        const msg = message.substr(message.toLowerCase().indexOf("message") + 8);
        if (msg == "") {
            client.chatMessage(steamID64, "Please include a message. Here's an example: \"!message Hi\"");
            return;
        }

        // Todo: check if owners are online. Get name of user and send that in the message aswell.
        for (let i = 0; i < owners.length; i++) {
            const id64 = owners[i];
            client.chatMessage(id64, "Message from " + steamID64 + ": " + msg);
        }

        client.chatMessage(steamID64, "Your message has been sent.");
    } else if (command == "reply" && Automatic.isOwner(steamID64) && true == false) {
        
    } else if (command == "add" && Automatic.isOwner(steamID64)) {
        const string = message.substr(message.toLowerCase().indexOf("add") + 4);
        let input = utils.stringToObject(string);
        if (input == null) {
            client.chatMessage(steamID64, "Your syntax is wrong. Here's an example: \"!add name=Rocket Launcher&quality=Strange\"");
            return;
        }

        if (!input.name) {
            client.chatMessage(steamID64, "You are missing a name. Here's an example: \"!add name=Rocket Launcher\"");
            return;
        }

        let match = Items.findMatch(input.name);
        if (match == null) {
            client.chatMessage(steamID64, "I could not find any items in schema that contains \"" + input.name + "\".");
            return;
        } else if (Array.isArray(match)) {
            const n = match.length;
            if (match.length > 20) {
                match = match.splice(0, 20);
            }
            let reply = "I found " + n + " " + utils.plural("item", n) + " that contains \"" + input.name + "\". Try with one of the items shown below:\n" + match.join(',\n');
            if (n > match.length) {
                const other = n - match.length;
                reply += ",\nand " + other + " other " + utils.plural("item", other) + ".";
            }

            client.chatMessage(steamID64, reply);
            return;
        }

        let item = {
            defindex: match,
            quality: 6,
            craftable: input.craftable ? input.craftable == 'true' : true,
            killstreak: input.killstreak || 0,
            australium: input.australium ? input.australium == 'true' : false
        };

        if (input.quality) {
            const quality = Items.getQuality(input.quality);
            if (quality == null) {
                client.chatMessage(steamID64, "Did not find a quality like \"" + input.quality + "\".");
                return;
            }
            item.quality = quality;
        }

        Prices.addItems([item], function(err, added) {
            if (err) {
                log.warn("Failed to add item to pricelist");
                log.debug(err.stack);
                client.chatMessage(steamID64, "I failed to add the item to the pricelist: " + (err.reason || err.message));
                return;
            }

            if (added == 1) {
                client.chatMessage(steamID64, "\"" + Items.getName(item) + "\" has been added to the pricelist (might take some time to show).");
            } else {
                client.chatMessage(steamID64, "No items were added, something might have went wrong.");
            }
        });
    } else if (command == "remove" && Automatic.isOwner(steamID64)) {
        const string = message.substr(message.toLowerCase().indexOf("remove") + 7);
        let input = utils.stringToObject(string);
        if (input == null) {
            client.chatMessage(steamID64, "Your syntax is wrong. Here's an example: \"!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher\"");
            return;
        }

        let items = input.items;
        if (!items || items == "") {
            client.chatMessage(steamID64, "You are missing items. Here's an example: \"!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher\"");
            return;
        }

        items = items.trim().replace(/  +/g, '').replace(/, /g, ',').split(',');

        Prices.removeItems(items, function(err, removed) {
            if (err) {
                log.warn("Failed to remove item(s) from pricelist");
                log.debug(err.stack);
                client.chatMessage(steamID64, "I failed to remove the item(s) from the pricelist: " + (err.reason || err.message));
                return;
            }

            if (removed > 0) {
                client.chatMessage(steamID64, removed + " " + utils.plural("item", removed) + " has been removed from the pricelist (might take some time to show).");
            } else {
                client.chatMessage(steamID64, "No items were removed, something might have went wrong.");
            }
        });
    } else if (command == "update" && Automatic.isOwner(steamID64)) {
        Prices.update(function(err) {
            if (err) {
                log.warn("Failed to update pricelist");
                log.debug(err.stack);
                if (err.message == "Too Many Requests") {
                    client.chatMessage(steamID64, "I failed to update the pricelist, try again in " + (err.retryAfter / 1000) + " " + utils.plural("second", err.retryAfter / 1000) + ".");
                } else {
                    client.chatMessage(steamID64, "I failed to update the pricelist: " + (err.reason || err.message));
                }
                return;
            }

            client.chatMessage(steamID64, "The pricelist has been refreshed.");
        });
    } else {
        client.chatMessage(steamID64, "I don't know what you mean, please type \"!help\" for all my commands!");
    }
}

function isCommand(message) {
    if (message.startsWith('!') || message.startsWith('/') || message.startsWith('.')) {
        const command = message.toLowerCase().split(" ")[0].substr(1);
        return command;
    } else {
        return false;
    }
}