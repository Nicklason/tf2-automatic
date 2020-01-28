import fs from 'graceful-fs';
import path from 'path';

let filesBeingSaved = 0;

export function readFile (p: string, json: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(p)) {
            resolve(null);
            return;
        }
    
        fs.readFile(p, { encoding: 'utf8' }, function (err, data) {
            if (err) {
                return reject(err);
            }
    
            if (json !== true) {
                return resolve(data);
            }
    
            if (data.length === 0) {
                return resolve(null);
            }
    
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (err) {
                return reject(err);
            }
    
            resolve(parsed);
        });
    });
};

export function writeFile (p: string, data: any, json: boolean): Promise<void> {
    return new Promise((resolve, reject) =>  { 
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
                    return reject(err);
                }
    
                writeFile();
            });
        }
    
        function writeFile () {
            filesBeingSaved++;
            fs.writeFile(p, write, { encoding: 'utf8' }, function (err) {
                filesBeingSaved--;
                
                if (err) {
                    return reject(err);
                }

                return resolve(null);
            });
        }
    });
};

export function isWritingToFiles (): boolean {
    return filesBeingSaved !== 0;
};
