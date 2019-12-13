const path = require('path');

module.exports = {
    loginKey: path.join(__dirname, '../../files/loginkey.txt'),
    pollData: path.join(__dirname, '../../files/polldata.json'),
    loginAttempts: path.join(__dirname, '../../files/loginattempts.json'),
    actions: path.join(__dirname, '../../files/actions.json'),
    pricelist: path.join(__dirname, '../../files/pricelist.json')
};
