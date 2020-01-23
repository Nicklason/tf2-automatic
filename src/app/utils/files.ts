import fs from 'graceful-fs';
import path from 'path';

let filesBeingSaved = 0;

/**
 * Reads a file
 * @param p
 * @param json
 * @param callback
 */
export function readFile (p: string, json: boolean, callback: (err?: Error, data?: object|null) => void): void {
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
 * Writes a file
 * @param p
 * @param data
 * @param json
 * @param callback
 */
export function writeFile (p: string, data: any, json: boolean, callback: (err?: Error) => void): void {
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

    filesBeingSaved++;

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
        fs.writeFile(p, write, { encoding: 'utf8' }, function (err) {
            filesBeingSaved--;
            callback(err);
        });
    }
};

/**
 * Check if we are writing any files
 */
export function isWritingToFiles (): boolean {
    return filesBeingSaved !== 0;
};
