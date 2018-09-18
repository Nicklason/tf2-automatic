const moment = require('moment');

const utils = require('./utils.js');

let Automatic, client, log, config, Friends, Inventory, Prices, Trade, Items, Statistics, tf2;

let cache = {};
const messageInterval = 2000;

exports.register = function (automatic) {
	Automatic = automatic;
	client = automatic.client;
	log = automatic.log;
	config = automatic.config;

	Inventory = automatic.inventory;
	Prices = automatic.prices;
	Trade = automatic.trade;
	Items = automatic.items;
	Friends = automatic.friends;
	Statistics = automatic.statistics;
	tf2 = automatic.tf2;
};

exports.init = function () {
	client.on('friendMessage', friendMessage);
};

function friendMessage(steamID, message) {
	if (Automatic.running != true) {
		return;
	}

	message = message.trim();
	const steamID64 = steamID.getSteamID64();
	Friends.getDetails(steamID64, function (err, details) {
		if (!Automatic.isOwner(steamID64) && isSpam(steamID64)) {
			return;
		} else if (!Friends.isFriend(steamID64)) {
			log.debug('Message is not from a friend');
			return;
		}

		log.info('Message from ' + (err ? steamID64 : details.personaname + ' (' + steamID64 + ')') + ': ' + message);

		const command = isCommand(message);
		if (command == 'how2trade') {
			Automatic.message(steamID64, 'You can either send me an offer yourself, or use one of my two commands to request a trade. They are "!buy" and "!sell". Say you want to buy a Team Captain, just type "!buy The Team Captain".');
		} else if (command == 'help') {
			let reply = 'Here\'s a list of all my commands: !help, !message <message>, !how2trade, !stock, !price <name>, !buy <amount> <name>, !sell <amount> <name>';
			if (Automatic.isOwner(steamID64)) {
				reply += ', !add, !remove, !update, !profit, !removefriends, !use, !name';
			}
			Automatic.message(steamID64, reply);
		} else if (command == 'stock') {
			const summary = Items.createSummary(Inventory.dictionary());

			let parsed = [];
			for (var name in summary) {
				if (name == 'Mann Co. Supply Crate Key' || name == 'Refined Metal' || name == 'Reclaimed Metal' || name == 'Scrap Metal') { continue; }
				parsed.push({ name: name, amount: summary[name] });
			}
			parsed.sort(function (a, b) {
				if (a.amount == b.amount) {
					if (a.name < b.name) return -1;
					if (a.name > b.name) return 1;
					return 0;
				}
				return b.amount - a.amount; // High -> Low
			});

			const pure = [
				{ name: 'Mann Co. Supply Crate Key', amount: Inventory.amount('Mann Co. Supply Crate Key') },
				{ name: 'Refined Metal', amount: Inventory.amount('Refined Metal') },
				{ name: 'Reclaimed Metal', amount: Inventory.amount('Reclaimed Metal') },
				{ name: 'Scrap Metal', amount: Inventory.amount('Scrap Metal') }
			];

			parsed.splice(0, 0, ...pure);

			let stock = [],
				left = 0;
			for (var i = 0; i < parsed.length; i++) {
				if (stock.length > 20) {
					left += parsed[i].amount;
				} else {
					stock.push(parsed[i].name + ': ' + parsed[i].amount);
				}
			}
			let reply = 'Here\'s a list of all the items that I have in my inventory:\n' + stock.join(', \n');
			if (left > 0) {
				reply += ',\nand ' + left + ' other ' + utils.plural('item', left);
			}
			reply += '.\nYou can see my inventory and prices here as well: https://backpack.tf/profiles/' + Automatic.getOwnSteamID();
			Automatic.message(steamID64, reply);
		} else if (command == 'price') {
			const name = message.substr(message.toLowerCase().indexOf('price') + 6);
			if (name == '') {
				Automatic.message(steamID64, 'You forgot to add a name. Here\'s an example: "!price Team Captain"');
				return;
			}

			let match = Prices.findMatch(name);
			if (match == null) {
				Automatic.message(steamID64, 'I could not find any items in my pricelist that contains "' + name + '", I might not be trading the item you are looking for.');
				return;
			} else if (Array.isArray(match)) {
				const n = match.length;
				if (match.length > 20) {
					match = match.splice(0, 20);
				}
				let reply = 'I\'ve found ' + n + ' items. Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.length) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}

			const buy = match.prices.hasOwnProperty('buy') ? utils.currencyAsText(match.prices.buy) : null,
				sell = match.prices.hasOwnProperty('sell') ? utils.currencyAsText(match.prices.sell) : null;

			const inInv = Inventory.amount(match.name),
				limit = Prices.getLimit(match.name);

			let segments = [];
			if (buy != null) {
				segments.push('I am buying a ' + match.name + ' for ' + buy);
			}

			if (sell != null) {
				if (segments.length == 0) {
					segments.push('I am selling a ' + match.name + ' for ' + sell);
				} else {
					segments.push('selling for ' + sell);
				}
			}

			let reply = segments.join(' and ') + '. I have ' + inInv;
			if (limit != -1 && buy != null) {
				reply += ' / ' + limit;
			}
			if (Automatic.isOwner(steamID64)) {
				const date = moment(match.updated_on * 1000).utc().format('DD-MM-YYYY HH:mm:ss');
				reply += ' (last updated ' + date + ' +0000)';
			}
			reply += '.';

			Automatic.message(steamID64, reply);
		} else if (command == 'message' && Automatic.isOwner(steamID64)) {
			const parts = message.split(' ');
			if (parts.length < 3) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!message 76561198120070906 Hi"');
				return;
			}

			const recipient = parts[1];
			if (recipient.length != 17 || !recipient.startsWith('7656')) {
				Automatic.message(steamID64, 'Please enter a valid SteamID64.');
				return;
			} else if (!Friends.isFriend(recipient)) {
				Automatic.message(steamID64, 'I am not friends with the user.');
				return;
			}

			const reply = message.substr(message.toLowerCase().indexOf(recipient) + 18);
			Automatic.message(recipient, 'Message from ' + (details ? details.personaname : steamID64) + ': ' + reply);
			Automatic.message(steamID64, 'Your message has been sent.');

			const owners = config.get().owners || [];
			for (let i = 0; i < owners.length; i++) {
				if (owners[i] == steamID64) {
					continue;
				}
				Automatic.message(owners[i], (details ? details.personaname + ' (' + steamID64 + ')' : steamID64) + ' replied with "' + reply + '".');
			}
		} else if (command == 'message' && !Automatic.isOwner(steamID64)) {
			const owners = config.get().owners;
			if (!owners || owners.length == 0) {
				Automatic.message(steamID64, 'Sorry, but there are no one that you can message :(');
				return;
			}

			const msg = message.substr(message.toLowerCase().indexOf('message') + 8);
			if (msg == '') {
				Automatic.message(steamID64, 'Please include a message. Here\'s an example: "!message Hi"');
				return;
			}

			// Todo: check if owners are online. Get name of user and send that in the message aswell.
			for (let i = 0; i < owners.length; i++) {
				const id64 = owners[i];
				Automatic.message(id64, 'Message from ' + (details ? details.personaname + ' (' + steamID64 + ')' : steamID64) + ': ' + msg);
			}

			Automatic.message(steamID64, 'Your message has been sent.');
		} else if (command == 'add' && Automatic.isOwner(steamID64)) {
			const string = message.substr(message.toLowerCase().indexOf('add') + 4);
			let input = utils.stringToObject(string);
			if (input == null) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!add name=Rocket Launcher&quality=Strange"');
				return;
			}

			if (!input.name) {
				Automatic.message(steamID64, 'You are missing a name. Here\'s an example: "!add name=Rocket Launcher"');
				return;
			}

			input.name = input.name.trim();

			let match = Items.findMatch(input.name);
			if (match == null) {
				Automatic.message(steamID64, 'I could not find any items in my pricelist that contains "' + input.name + '", I might not be trading the item you are looking for.');
				return;
			} else if (Array.isArray(match)) {
				const n = match.length;
				if (match.length > 20) {
					match = match.splice(0, 20);
				}
				let reply = 'I\'ve found ' + n + ' items. Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.length) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}

			let limit = config.get('stocklimit');
			if (input.limit && input.limit != '') {
				limit = parseInt(input.limit);
				if (isNaN(limit)) {
					Automatic.message(steamID64, '"' + input.limit + '" is not a valid limit. Here\'s an example: "!add name=Team Captain&limit=2"');
					return;
				} else if (limit < -1) {
					Automatic.message(steamID64, '"' + input.limit + '" is not a valid limit. You can use -1 for unlimited, 0 for no buying, 1 for a limit of 1 and so on.');
					return;
				}
			}

			let add = {
				defindex: Number(match),
				quality: 6,
				craftable: input.craftable ? input.craftable == 'true' : true,
				killstreak: parseInt(input.killstreak) || 0,
				australium: input.australium ? input.australium == 'true' : false,
				effect: input.effect || null,
				meta: {
					max_stock: limit
				},
				autoprice: true,
				enabled: true
			};

			if (input.autoprice != undefined) {
				const autoprice = input.autoprice != 'false';
				add.autoprice = autoprice;
			}

			let buy = {};
			let sell = {};
			if (input.buy_keys) {
				buy.keys = parseInt(input.buy_keys);
			}
			if (input.buy_metal) {
				buy.metal = parseFloat(input.buy_metal);
			}
			if (input.sell_keys) {
				sell.keys = parseInt(input.sell_keys);
			}
			if (input.sell_metal) {
				sell.metal = parseFloat(input.sell_metal);
			}

			let prices = {};
			if (Object.keys(buy) != 0) {
				if (!buy.hasOwnProperty('keys')) {
					buy.keys = 0;
				} else if (!buy.hasOwnProperty('metal')) {
					buy.metal = 0;
				}
				prices.buy = buy;
			}
			if (Object.keys(sell) != 0) {
				if (!sell.hasOwnProperty('keys')) {
					sell.keys = 0;
				} else if (!sell.hasOwnProperty('metal')) {
					sell.metal = 0;
				}
				prices.sell = sell;
			}
			if (Object.keys(prices) != 0) {
				add.prices = prices;
				add.autoprice = false;
			}

			if (input.quality) {
				input.quality = utils.capitalizeEach(input.quality);
				const quality = Items.getQuality(input.quality);
				if (quality == null) {
					Automatic.message(steamID64, 'Did not find a quality like "' + input.quality + '".');
					return;
				}
				add.quality = Number(quality);
			}

			if (input.effect) {
				const effect = Items.getEffect(input.effect);
				if (effect == null) {
					Automatic.message(steamID64, 'Did not find an effect like "' + input.effect + '".');
					return;
				}
				add.effect = effect;
			}

			Prices.addItem(add, function (err, listing) {
				if (err) {
					const error = err.messages ? err.messages.join(', ').toLowerCase() : err.message;
					Automatic.message(steamID64, 'I failed to add the item to the pricelist: ' + error);
					return;
				}

				let reply = '"' + listing.name + '" has been added to the pricelist';
				if (listing.prices == null) {
					reply += ' (not yet priced)';
				}

				if (limit != null) {
					reply += ' with a limit of ' + limit;
				}
				reply += '.';
				Automatic.message(steamID64, reply);
			});
		} else if (command == 'remove' && Automatic.isOwner(steamID64)) {
			const string = message.substr(message.toLowerCase().indexOf('remove') + 7);
			let input = utils.stringToObject(string);
			if (input == null) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher"');
				return;
			}

			if (input.all == 'true') {
				if (!input.hasOwnProperty('i_am_sure')) {
					Automatic.message(steamID64, 'Are you sure? Write "!remove all=true&i_am_sure=yes_i_am"');
					return;
				} else if (input.i_am_sure != 'yes_i_am') {
					Automatic.message(steamID64, 'No items were removed');
					return;
				}

				Prices.removeAll(function (err, result) {
					if (err) {
						const error = err.messages ? err.messages.join(', ').toLowerCase() : err.message;
						Automatic.message(steamID64, 'I failed to clear the pricelist: ' + error);
						return;
					}

					const removed = result.removed;
					if (removed > 0) {
						Automatic.message(steamID64, 'The pricelist has been cleared');
					} else {
						Automatic.message(steamID64, 'No items were removed, your pricelist was already empty');
					}
				});
			} else {
				let items = input.items;
				if (!items || items == '') {
					Automatic.message(steamID64, 'You are missing items. Here\'s an example: "!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher"');
					return;
				}

				items = items.trim().replace(/  +/g, '').replace(/, /g, ',').split(',');

				Prices.removeItems(items, function (err, result) {
					if (err) {
						const error = err.messages ? err.messages.join(', ').toLowerCase() : err.message;
						Automatic.message(steamID64, 'I failed to remove the ' + utils.plural('item', items.length) + ' from the pricelist: ' + error);
						return;
					}

					const removed = result.removed;
					if (removed > 0) {
						Automatic.message(steamID64, 'The ' + utils.plural('item', removed) + ' has been removed from the pricelist');
					} else {
						Automatic.message(steamID64, 'No items were removed, you need to write out the name exactly as it is in the pricelist.');
					}
				});
			}
		} else if (command == 'update' && Automatic.isOwner(steamID64)) {
			const string = message.substr(message.toLowerCase().indexOf('update') + 7);
			let input = utils.stringToObject(string);
			if (input == null) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!update name=Rocket Launcher&limit=2"');
				return;
			}

			if (!input.name) {
				Automatic.message(steamID64, 'You are missing a name. Here\'s an example: "!update name=Rocket Launcher"');
				return;
			}

			input.name = input.name.trim();
			const name = input.name;

			let update = {};

			if (input.autoprice != undefined) {
				const autoprice = input.autoprice != 'false';
				update.autoprice = autoprice;
			}

			let buy = {};
			let sell = {};
			if (input.buy_keys) {
				buy.keys = parseInt(input.buy_keys);
			}
			if (input.buy_metal) {
				buy.metal = parseFloat(input.buy_metal);
			}
			if (input.sell_keys) {
				sell.keys = parseInt(input.sell_keys);
			}
			if (input.sell_metal) {
				sell.metal = parseFloat(input.sell_metal);
			}

			let prices = {};
			if (Object.keys(buy) != 0) {
				if (!buy.hasOwnProperty('keys')) {
					buy.keys = 0;
				} else if (!buy.hasOwnProperty('metal')) {
					buy.metal = 0;
				}
				prices.buy = buy;
			}
			if (Object.keys(sell) != 0) {
				if (!sell.hasOwnProperty('keys')) {
					sell.keys = 0;
				} else if (!sell.hasOwnProperty('metal')) {
					sell.metal = 0;
				}
				prices.sell = sell;
			}
			if (Object.keys(prices) != 0) {
				update.prices = prices;
				update.autoprice = false;
			}

			let limit = null;
			if (input.limit && input.limit != '') {
				limit = parseInt(input.limit);
				if (isNaN(limit)) {
					Automatic.message(steamID64, '"' + input.limit + '" is not a valid limit. Here\'s an example: "!update name=Team Captain&limit=2"');
					return;
				} else if (limit < -1) {
					Automatic.message(steamID64, '"' + input.limit + '" is not a valid limit. You can use -1 for unlimited, 0 for no buying, 1 for a limit of 1 and so on.');
					return;
				}
			} else {
				limit = config.get('stocklimit');
			}

			if (limit != null) {
				update.meta = {
					max_stock: limit
				};
			}

			Prices.updateItem(name, update, function (err, result) {
				if (err) {
					const error = err.messages ? err.messages.join(', ').toLowerCase() : err.message;
					Automatic.message(steamID64, 'I failed to update the item: ' + error);
					return;
				}

				Automatic.message(steamID64,  'Updated ' + result.name + '.');
			});
		} else if (command == 'profit' && Automatic.isOwner(steamID64)) {
			const total = Statistics.profit();
			const today = Statistics.profit(24);
			const potential = Statistics.potentialProfit();

			const totalCurrencies = Prices.valueToCurrencies(total);
			const todayCurrencies = Prices.valueToCurrencies(today);
			const potentialCurrencies = Prices.valueToCurrencies(potential);

			let response = 'You\'ve made ' + utils.currencyAsText(todayCurrencies) + ' today, ' + utils.currencyAsText(totalCurrencies) + ' in total';
			if (potential > 0) {
				response += ' (' + utils.currencyAsText(potentialCurrencies) + ' more if all items were sold)'; 
			}
			response += '.';

			Automatic.message(steamID64, response);
		} else if (command == 'removefriends' && Automatic.isOwner(steamID64)) {
			const friends = Friends.all();
			const friendsToKeep = Friends.toKeep();

			let removed = 0;
			for (let i = 0; i < friends.length; i++) {
				const steamid = friends[i];
				if (!friendsToKeep.includes(steamid)) {
					Automatic.message(steamid, 'I am clearing my friends list, feel free to add me again.');
					Friends.remove(steamid);
					removed++;
				}
			}

			Automatic.message(steamID64, 'I\'ve removed ' + removed + ' ' + utils.plural('friend', removed) + '.');
		} else if (command == 'use' && Automatic.isOwner(steamID64)) {
			const string = message.substr(message.toLowerCase().indexOf('use') + 4);
			let input = utils.stringToObject(string);
			if (input == null) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!use name=Backpack Expander&amount=10"');
				return;
			}

			if (!input.name) {
				Automatic.message(steamID64, 'You are missing a name. Here\'s an example: "!use name=Backpack Expander"');
				return;
			}
			let amount = 1;
			if (input.amount) {
				amount = parseInt(input.amount);
				if (isNaN(amount)) {
					Automatic.message(steamID64, '"' + input.amount + '" is not a valid amount. Here\'s an example: "!use name=Backpack Expander&amount=10"');
					return;
				} else if (amount > 3) {
					amount = 3;
				}
			}
			if (input.name.toLowerCase() == 'backpack expander') {
				if (tf2.haveGCSession != true) {
					Automatic.message(steamID64, 'I am not connected to the TF2 game coordinator, try again later.');
					return;
				}

				const dict = Inventory.dictionary();
				let expanders = [];
				if (dict['Backpack Expander'] != undefined) {
					expanders = expanders.concat(dict['Backpack Expander']);
				}
				if (dict['Non-Craftable Backpack Expander'] != undefined) {
					expanders = expanders.concat(dict['Non-Craftable Backpack Expander']);
				}

				if (expanders.length == 0) {
					Automatic.message(steamID64, 'I don\'t have any Backpack Expanders.');
					return;
				} else if (expanders.length < amount) {
					amount = expanders.length;
				}

				const maxSlots = 3000;
				const slots = tf2.backpackSlots;
				const canUse = (maxSlots - slots) / 100;
				if (canUse == 0) {
					Automatic.message(steamID64, 'I can\'t expand my inventory any further, I already have ' + maxSlots + ' slots.');
					return;
				} else if (canUse < amount) {
					amount = canUse;
				}

				const ids = expanders.slice(0, amount);

				let left = ids.length;
				tf2.on('itemRemoved', function (item) {
					if (item.defIndex == 5050) {
						left--;
					}
					
					if (left == 0) {
						tf2.removeAllListeners('itemRemoved');
						client.gamesPlayed([440]);
						Inventory.getInventory(Automatic.getOwnSteamID(), function () {
							client.gamesPlayed([require('../package.json').name, 440]);
							log.debug('Sorting inventory');
							tf2.sortBackpack(3);
							Automatic.message(steamID64, 'I can now fit ' + tf2.backpackSlots + ' items in my TF2 inventory.');
						});
					}
				});

				for (let i = 0; i < ids.length; i++) {
					const id = ids[i];
					tf2.useItem(id);
				}
			} else {
				Automatic.message(steamID64, 'Unknown item, usable items: Backpack Expander');
			}
		} else if (command == 'buy' || command == 'sell') {
			let name = message.substr(message.toLowerCase().indexOf(command) + command.length + 1);
			let amount = 1;
			if (/^[-]?\d+$/.test(name.split(' ')[0])) {
				amount = parseInt(name.split(' ')[0]);
				name = name.replace(amount, '').trim();
			}

			if (name == '') {
				Automatic.message(steamID64, 'You forgot to add a name. Here\'s an example: "!buy The Team Captain"');
				return;
			}

			if (1 > amount) amount = 1;

			let match = Prices.findMatch(name);
			if (match == null) {
				Automatic.message(steamID64, 'I could not find any items in my pricelist that contains "' + name + '", I might not be trading the item you are looking for.');
				return;
			} else if (Array.isArray(match)) {
				const n = match.length;
				if (match.length > 20) {
					match = match.splice(0, 20);
				}
				let reply = 'I\'ve found ' + n + ' items. Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.length) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}

			const selling = command == 'buy';

			Trade.requestOffer(steamID64, match.name, amount, selling);
		} else if (command == 'name' && Automatic.isOwner(steamID64)) {
			const name = message.substr(message.toLowerCase().indexOf('name') + 5);
			if (name == '') {
				Automatic.message(steamID64, 'You forgot to add a name. Here\'s an example: "!name Mr. Bot"');
				return;
			}

			client.setPersona(1, name);
			Automatic.message(steamID64, 'My name has been changed to "' + name + '"');
		} else if (message == 'I don\'t know what you mean, please type "!help" for all my commands!') {
      			return;
		} else {
			Automatic.message(steamID64, 'I don\'t know what you mean, please type "!help" for all my commands!');
		}
	});
}

function isCommand(message) {
	if (message.startsWith('!') || message.startsWith('/') || message.startsWith('.') || message.startsWith('?')) {
		const command = message.toLowerCase().split(' ')[0].substr(1);
		return command;
	} else {
		return false;
	}
}

function isSpam(key) {
	let count = (cache[key] || 0) + 1;
	cache[key] = count;
	return count > 1;
}

setInterval(function() {
	cache = {};
}, messageInterval);
