const request = require('@nicklason/request-retry');

exports.getPricelist = function(source = 'bptf', currency = 'USD', callback) {
	request({
		method: 'GET',
		uri: 'https://api.prices.tf/items',
		headers: {
			'Authorization': 'Token ' + process.env.PRICESTF_API_TOKEN
		},
		qs: {
			src: source,
			cur: currency
		}
	}, function (err, res, body) {
		if (err) {
			return callback(err);
		}
		callback(null, body);
	});
}

exports.getPrice = function(sku, source = 'bptf', currency = 'USD', callback) {
	request({
		method: 'GET',
		uri: 'https://api.prices.tf/items/' + sku,
		headers: {
			'Authorization': 'Token ' + process.env.PRICESTF_API_TOKEN
		},
		qs: {
			src: source,
			cur: currency
		}
	}, function (err, res, body) {
		if (err) {
			return callback(err);
		}
		callback(null, body);
	});
}

exports.addItemToDB = function(sku, source = 'bptf', callback) {
	request({
		method: 'POST',
		uri: 'https://api.prices.tf/items/' + sku,
		headers: {
			'Authorization': 'Token ' + process.env.PRICESTF_API_TOKEN
		},
		form: {
			source: source
		}
	}, function (err, res, body) {
		if (err) {
			return callback(err);
		}
		callback(null, body);
	});
}
