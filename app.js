require('module-alias/register');

const dotenv = require('dotenv');
dotenv.config();

const tf2 = require('lib/tf2');

const handlerManager = require('app/handler-manager');
handlerManager.setup();

const handler = handlerManager.getHandler();

tf2.init(function (err) {
    if (err) {
        throw err;
    }

    handler.onRun(function () {
        require('app/login')(function (err) {
            if (err) {
                handler.onLoginFailure(err);
                return;
            }

            handler.onLoginSuccessful();
        });
    });
});
