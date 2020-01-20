const io = require('socket.io-client');

const log = require('lib/logger');

const package = require('@root/package.json');

const socket = io('https://api.prices.tf', {
    forceNew: true,
    extraHeaders: {
        'User-Agent': package.name + '@' + package.version
    },
    autoConnect: false
});

socket.on('connect', function () {
    log.debug('Connected to socket server', { event: 'connect', from: 'socket.io-client' });

    socket.emit('authentication', process.env.PRICESTF_API_KEY);
});

socket.on('authenticated', function () {
    log.debug('Authenticated with socket server', { event: 'authenticated', from: 'socket.io-client' });
});

socket.on('unauthorized', function (err) {
    log.debug('Failed to authenticate with socket server', { event: 'unauthorized', from: 'socket.io-client', error: err });
});

socket.on('disconnect', function (reason) {
    log.debug('Disconnected from socket server', { event: 'disconnect', from: 'socket.io-client', reason: reason });

    if (reason === 'io server disconnect') {
        socket.connect();
    }
});

socket.on('error', function (err) {
    log.debug('An error was emitted', { event: 'error', from: 'socket.io-client', error: err });
});

module.exports = socket;
