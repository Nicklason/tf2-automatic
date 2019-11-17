const io = require('socket.io-client');

const package = require('@root/package.json');

const socket = io('https://api.prices.tf', {
    forceNew: true,
    extraHeaders: {
        'User-Agent': package.name + '@' + package.version
    }
});

socket.on('connect', function () {
    socket.emit('authentication', process.env.PRICESTF_API_TOKEN);
});

socket.on('disconnect', function (reason) {
    if (reason === 'io server disconnect') {
        socket.connect();
    }
});

module.exports = socket;
