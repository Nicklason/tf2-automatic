# Handlers

## Getting started

The handler is what you will be using to control the bot. You control the bot by making event listeners, and using the exported functions made by the handler manager.

## Events

There is a list of events that you are required to use in order for the bot to work properly. An example of an event you need to respond to properly is the `run` event:

```js
// This is an event listener, it listens to the "run" event.

// The run event is emitted when you first start the bot and is intended to be used to set up functions / load data before starting the bot.

// In order to start the bot, you need to call the done command

/**
 * Event listener for the run event
 * @param {Function} done The bot will only start once you call the done function
 * @description Event is emitted once the bot starts
 */
exports.onRun = function (done) {
    console.log('Starting the bot...');

    doAsyncWork(() => {
        console.log('Done with async work, logging in...');
        done();
    });
};
```

Once the bot it set up and ready, the `ready` event will be emitted.

```js
/**
 * Event listener for the ready event
 * @description Event is emitted shoryly after the bot has logged. The bot will be signed in, and the bptf-listings module will be initialized once the event is emitted.
 */
exports.onReady = function () {
    // You are now free to use the bptf-listings module and the other features that the bot has to offer

    console.log('Everything is ready!');
};
```

## Functions

There are also exported functions. These functions can only be called once the `run` event has been emitted.

```js
/**
 * Event listener for the login failure event
 * @param {Error} err Error emitted when a login attempt was made
 * @description Event is emitted if the bot fails to sign in on startup, this error is caught and parsed as an argument to the listener.
 */
exports.onLoginFailure = function (err) {
    console.log('Failed to login! (' + err.message + ')');

    // Exported function being called. This function gracefully stops the bot
    exports.shutdown();
};

/**
 * Event listener for the shutdown event
 * @param {Error} error Error object
 * @param {Function} done
 * @description Event is emitted once a shutdown has been requested. Same idea as the "ready" event, except after calling the done function the bot will stop and the process will be killed
 */
exports.onShutdown = function (error, done) {
    console.log('The bot is stopping, cleaning up...');
    doAsyncWork(() => {
        console.log('Done cleaning up, stopping...');
        done();
    });
};
```

## Accessing modules

Modules such as "steam-user", "tf2-schema" and "bptf-listings" can all be accessed by simply requiring the file:

```js
// steam-user
const client = require('lib/client');

// tf2-schema
const schemaManager = require('lib/tf2-schema');

// bptf-listings
const listingManager = require('lib/bptf-listings');

// etc...
```

While that might be sufficient, it is also possible to access the client directly from the event listeners as it is bound to every listener.

```js
// Require steam-user module
const SteamUser = require('steam-user');

const client = require('lib/client');

exports.onReady = function () {
    console.log('Logged into Steam!');

    // Access client from "this"
    console.log('My steamid: ' + this.steamID.getSteamID64());

    // Or from requiring it
    console.log('My steamid: ' + client.steamID.getSteamID64());

    // Set Steam account as Online
    this.setPersona(SteamUser.EPersonaState.Online);
};
```

## More information

For more information on all the events, see the [examples](https://github.com/Nicklason/tf2-automatic/tree/bot-framework/app/handler/examples). All events are described in the [template](https://github.com/Nicklason/tf2-automatic/blob/bot-framework/app/handler/examples/template.js) file.
