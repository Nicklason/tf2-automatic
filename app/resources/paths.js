const path = require('path');

const folderName = process.env.FOLDER_NAME || process.env.STEAM_ACCOUNT_NAME;

module.exports = {
    loginKey: path.join(__dirname, `../../files/${folderName}/loginkey.txt`),
    pollData: path.join(__dirname, `../../files/${folderName}/polldata.json`),
    loginAttempts: path.join(__dirname, `../../files/${folderName}/loginattempts.json`),
    pricelist: path.join(__dirname, `../../files/${folderName}/pricelist.json`)
};
