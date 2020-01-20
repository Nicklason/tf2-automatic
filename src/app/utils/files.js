const fs = require('graceful-fs');
const path = require('path');

let filesBeingSaved = 0;

/**
 * Reads a file
 * @param {String} p
 * @param {Boolean} json If what you are reading is JSON and you want to parse it
 * @param {Function} callback
 */
exports.readFile = function (p, json, callback) {
    if (typeof json === 'function') {
        callback = json;
        json = false;
    }

    if (!fs.existsSync(p)) {
        callback(null, null);
        return;
    }

    fs.readFile(p, { encoding: 'utf8' }, function (err, data) {
        if (err) {
            return callback(err);
        }

        if (json !== true) {
            return callback(null, data);
        }

        if (data.length === 0) {
            return callback(null, null);
        }

        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch (err) {
            return callback(err);
        }

        callback(null, parsed);
    });
};

/**
 * Writes to file
 * @param {String} p
 * @param {*} data
 * @param {Boolean} json If you want to stringify the data you are writing
 * @param {Function} callback
 */
exports.writeFile = function (p, data, json, callback) {
    if (typeof json === 'function') {
        callback = json;
        json = false;
    }

    let write;
    if (json === true) {
        write = process.env.DEBUG === 'true' ? JSON.stringify(data, undefined, 4) : JSON.stringify(data);
    } else {
        write = data;
    }

    const dir = path.dirname(p);

    if (fs.existsSync(dir)) {
        writeFile();
    } else {
        fs.mkdir(dir, { recursive: true }, function (err) {
            if (err) {
                return callback(err);
            }

            writeFile();
        });
    }

    function writeFile () {
        filesBeingSaved++;
        fs.writeFile(p, write, { encoding: 'utf8' }, function (err) {
            filesBeingSaved--;
            callback(err);
        });
    }
};

exports.isWritingToFiles = function () {
    return filesBeingSaved !== 0;
};

