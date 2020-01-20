import log from '../../lib/logger';

export default function (err, done) {
    require('./listings').removeAll(function (err) {
        if (err) {
            log.warn('Failed to remove all listings: ', err);
        }

        done();
    });
};
