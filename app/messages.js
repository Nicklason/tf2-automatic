const moment = require('moment');

const utils = require('./utils.js');

let Automatic, client, log, config, Friends, Inventory, Prices, Trade, Items, Statistics;

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
};

exports.init = function () {
	client.on('friendMessage', friendMessage);
};

function friendMessage(steamID, message) {
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
			let reply = 'Here\'s a list of all my commands: !help, !message, !how2trade, !stock, !price, !buy, !sell';
			if (Automatic.isOwner(steamID64)) {
				reply += ', !add, !remove, !update, !profit';
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
				let reply = 'I found ' + n + ' ' + utils.plural('item', n) + ' that contains "' + name + '". Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.lenght) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}

			const buy = utils.currencyAsText(match.price.buy),
				sell = utils.currencyAsText(match.price.sell);

			const inInv = Inventory.amount(match.item.name),
				limit = config.limit(match.item.name);

			let reply = 'I am buying a ' + match.item.name + ' for ' + buy + ' and selling for ' + sell + '. I have ' + inInv;
			if (limit != -1) {
				reply += ' / ' + limit;
			}
			if (Automatic.isOwner(steamID64)) {
				const date = moment(match.time_updated * 1000).format('DD-MM-YYYY HH:mm:ss');
				reply += ' (last updated ' + date + ')';
			}
			reply += '.';

			Automatic.message(steamID64, reply);
		} else if (command == 'message' && Automatic.isOwner(steamID64)) {
			const parts = message.split(' ');
			if (parts.length < 3) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!reply 76561198120070906 Hi"');
				return;
			}

			const recipient = parts[1];
			if (recipient.length != 17 || !recipient.startsWith('7656')) {
				Automatic.message(steamID64, 'Please write use a valid SteamID64.');
				return;
			} else if (!Friends.isFriend(recipient)) {
				Automatic.message(steamID64, 'I am not friends with the user.');
				return;
			}

			const reply = message.substr(message.toLowerCase().indexOf(recipient) + 18);
			Automatic.message(recipient, 'Message from ' + (details ? details.personaname + ' (' + steamID64 + ')' : steamID64) + ': ' + reply);
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
				Automatic.message(steamID64, 'Sorry, but there are noone that you can message :(');
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
				Automatic.message(steamID64, 'I could not find any items in the schema that contains "' + input.name + '".');
				return;
			} else if (Array.isArray(match)) {
				const n = match.length;
				if (match.length > 20) {
					match = match.splice(0, 20);
				}
				let reply = 'I found ' + n + ' ' + utils.plural('item', n) + ' that contains "' + input.name + '". Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.length) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}

			let limit = null;
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

			let item = {
				defindex: Number(match),
				quality: 6,
				craftable: input.craftable ? input.craftable == 'true' : true,
				killstreak: parseInt(input.killstreak) || 0,
				australium: input.australium ? input.australium == 'true' : false
			};

			if (input.quality) {
				input.quality = utils.capitalizeEach(input.quality);
				const quality = Items.getQuality(input.quality);
				if (quality == null) {
					Automatic.message(steamID64, 'Did not find a quality like "' + input.quality + '".');
					return;
				}
				item.quality = Number(quality);
			}

			Prices.addItems([item], function (err, added) {
				if (err) {
					Automatic.message(steamID64, 'I failed to add the item to the pricelist: ' + (err.reason || err.message));
					return;
				}

				if (added == 1) {
					const name = Items.getName(item);

					let reply = '"' + name + '" has been added to the pricelist';
					if (limit != null) {
						config.addLimit(name, limit);

						reply += ' with a limit of ' + limit;
					}
					reply += ' (might take some time to update).';
					Automatic.message(steamID64, reply);
				} else {
					Automatic.message(steamID64, 'No items were added, something might have went wrong.');
				}
			});
		} else if (command == 'remove' && Automatic.isOwner(steamID64)) {
			const string = message.substr(message.toLowerCase().indexOf('remove') + 7);
			let input = utils.stringToObject(string);
			if (input == null) {
				Automatic.message(steamID64, 'Your syntax is wrong. Here\'s an example: "!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher"');
				return;
			}

			let items = input.items;
			if (!items || items == '') {
				Automatic.message(steamID64, 'You are missing items. Here\'s an example: "!remove items=Strange Rocket Launcher, Strange Australium Rocket Launcher"');
				return;
			}

			items = items.trim().replace(/  +/g, '').replace(/, /g, ',').split(',');

			Prices.removeItems(items, function (err, removed) {
				if (err) {
					Automatic.message(steamID64, 'I failed to remove the item(s) from the pricelist: ' + (err.reason || err.message));
					return;
				}

				for (let i = 0; i < items.length; i++) {
					const name = items[i];
					config.removeLimit(name);
				}

				if (removed > 0) {
					Automatic.message(steamID64, removed + ' ' + utils.plural('item', removed) + ' has been removed from the pricelist (might take some time to update).');
				} else {
					Automatic.message(steamID64, 'No items were removed. Try and write out the name exactly as it is in the pricelist.');
				}
			});
		} else if (command == 'update' && Automatic.isOwner(steamID64)) {
			Prices.update(function (err) {
				if (err) {
					if (err.message == 'Too Many Requests') {
						Automatic.message(steamID64, 'I failed to update the pricelist, try again in ' + (err.retryAfter / 1000) + ' ' + utils.plural('second', err.retryAfter / 1000) + '.');
					} else {
						Automatic.message(steamID64, 'I failed to update the pricelist: ' + (err.reason || err.message));
					}
					return;
				}

				Automatic.message(steamID64, 'The pricelist has been refreshed.');
			});
		} else if (command == 'profit' && Automatic.isOwner(steamID64)) {
			const total = Statistics.profit();
			const today = Statistics.profit(24);

			const totalCurrencies = Prices.valueToPure(total, true, true);
			const todayCurrencies = Prices.valueToPure(today, true, true);

			Automatic.message(steamID64, 'You\'ve made ' + utils.currencyAsText(todayCurrencies) + ' today, ' + utils.currencyAsText(totalCurrencies) + ' in total.');
		} else if (command == 'buy' || command == 'sell') {
			let name = message.substr(message.toLowerCase().indexOf(command) + command.length + 1);
			let amount = 1;
			if (/^[-]?\d+$/.test(name.split(' ')[0])) {
				amount = parseInt(name.split(' ')[0]);
				name = name.replace(amount, '').trim();
			}

			if (name == '') {
				Automatic.message(steamID64, 'You forgot to add a name. Here\'s an example: "!buy Team Captain"');
				return;
			}

			if (1 > amount) amount = 1;
			else if (10 < amount) amount = 10;

			let match = Prices.findMatch(name);
			if (match == null) {
				Automatic.message(steamID64, 'I could not find any items in my pricelist that contains "' + name + '", I might not be trading the item you are looking for.');
				return;
			} else if (Array.isArray(match)) {
				const n = match.length;
				if (match.length > 20) {
					match = match.splice(0, 20);
				}
				let reply = 'I found ' + n + ' ' + utils.plural('item', n) + ' that contains "' + name + '". Try with one of the items shown below:\n' + match.join(',\n');
				if (n > match.lenght) {
					const other = n - match.length;
					reply += ',\nand ' + other + ' other ' + utils.plural('item', other) + '.';
				}

				Automatic.message(steamID64, reply);
				return;
			}
			const selling = command == 'buy';
			Trade.requestOffer(steamID64, match.item.name, amount, selling);
		} else {
			Automatic.message(steamID64, 'I don\'t know what you mean, please type "!help" for all my commands!');
		}
	});
}

function isCommand(message) {
	if (message.startsWith('!') || message.startsWith('/') || message.startsWith('.')) {
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