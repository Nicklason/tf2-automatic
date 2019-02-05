/* eslint-env browser */

const fs = require('graceful-fs');
const webshot = require('webshot');

let Automatic;
let log;
let Prices;

const FOLDER_NAME = 'images';

const OPTIONS = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.87 Safari/537.36',
    renderDelay: 5000,
    cookies: [],
    onLoadFinished: function () {
        const elements = document.getElementsByClassName('tradeoffer_items_banner');
        if (elements.length == 0) {
            return;
        }
        const banner = elements[0];

        let text = banner.innerHTML;
        const digit = text.match(/\d/);
        const index = text.indexOf(digit);
        if (index == -1) {
            return;
        }

        text = text.substring(0, index);
        banner.innerHTML = text;
    }
};

exports.register = function (automatic) {
    Automatic = automatic;
    log = automatic.log;

    Prices = automatic.prices;

    if (!fs.existsSync(FOLDER_NAME)) {
        fs.mkdirSync(FOLDER_NAME);
    }
};

exports.setCookies = function (cookies) {
    OPTIONS.cookies = [];

    for (let i = 0; i < cookies.length; i++) {
        const parts = cookies[i].split('=');
        const name = parts[0];
        const value = parts[1];

        OPTIONS.cookies.push({
            name: name,
            value: value,
            domain: 'steamcommunity.com',
            path: '/'
        });
    }
};

exports.receivedOfferChanged = function (id, callback) {
    const url = 'https://steamcommunity.com/profiles/' + Automatic.getOwnSteamID() + '/tradeoffers';
    screenshot(url + '/?history=1', id, callback);
};

exports.sentOfferChanged = function (id, callback) {
    const url = 'https://steamcommunity.com/profiles/' + Automatic.getOwnSteamID() + '/tradeoffers';
    screenshot(url + '/sent/?history=1', id, callback);
};

function screenshot (url, id, callback) {
    OPTIONS.captureSelector = '.tradeoffer#tradeofferid_' + id + ' .tradeoffer_items_ctn';
    webshot(url, `./${FOLDER_NAME}/${id}.png`, OPTIONS, function (err) {
        if (err) {
            return callback(err);
        }


        fs.readFile(`./${FOLDER_NAME}/${id}.png`, function (err, data) {
            if (err) {
                return callback(err);
            }

            Prices.upload(data, 'image/png', callback);
            log.debug('Removing image');
            fs.unlinkSync(`./${FOLDER_NAME}/${id}.png`);
        });
    });
}
