const admins = process.env.ADMINS === undefined ? [] : JSON.parse(process.env.ADMINS);

module.exports = function (steamID) {
    const steamid64 = typeof steamID === 'string' ? steamID : steamID.getSteamID64();
    return admins.indexOf(steamid64) !== -1;
};
