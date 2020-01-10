const request = require('@nicklason/request-retry');
const semver = require('semver');

function checkForUpdates() {
	request.get('https://raw.githubusercontent.com/Nicklason/tf2-automatic/master/package.json', function (err, body) {
		if (err) {
			log.warn('Failed to check for updates: ' + err);
			return
		}

		if (semver.lt(package.version, body.version)) {
			require('app/admins').message(`Update available! Current: v${package.version}, Latest: v${body.version}, See the wiki for help: https://github.com/Nicklason/tf2-automatic/wiki/Updating`);
		}
	});
}

setInterval(checkForUpdates,  1000 * 2 * 60 * 60);
