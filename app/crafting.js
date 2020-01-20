const log = require('../lib/logger');
const client = require('../lib/client');
const tf2 = require('../lib/tf2');

const handlerManager = require('./handler-manager');
const inventoryManager = require('./inventory');

const jobs = [];

let processingQueue = false;
let startedProcessing = false;

// TODO: Have option to choose specific assetids for combining and smelting metal

/**
 * Enqueues a smelt metal job
 * @param {Number} defindex Defindex of item to smelt
 * @param {Number} amount Amount of times to repeat the job
 */
exports.smeltMetal = function (defindex, amount) {
    if ([5001, 5002].indexOf(defindex) === -1) {
        log.warn('Invalid defindex for smelt job `' + defindex + '`');
        return;
    }

    log.debug('Enqueueing ' + amount + ' smelt job(s) for ' + defindex);

    for (let i = 0; i < amount; i++) {
        jobs.push({ type: 'crafting', smelt: true, defindex: defindex });
    }

    handleJobsQueue();
};

/**
 * Enqueues a combine metal job
 * @param {Number} defindex Defindex of item to combine
 * @param {Number} amount Amount of times to repeat the job
 */
exports.combineMetal = function (defindex, amount) {
    if ([5000, 5001].indexOf(defindex) === -1) {
        log.warn('Invalid defindex for combine job `' + defindex + '`');
        return;
    }

    log.debug('Enqueueing ' + amount + ' combine job(s) for ' + defindex);

    for (let i = 0; i < amount; i++) {
        jobs.push({ type: 'crafting', smelt: false, defindex: defindex });
    }

    handleJobsQueue();
};

/**
 * Enqueues a use job
 * @param {String} assetid Assetid of the item to use
 * @param {Function} [callback]
 */
exports.useItem = function (assetid, callback) {
    const job = { type: 'use', assetid: assetid };

    if (callback !== undefined) {
        job.callback = callback;
    }

    jobs.push(job);

    handleJobsQueue();
};

/**
 * Enqueues a delete job
 * @param {String} assetid Assetid of the item to delete
 * @param {Function} [callback]
 */
exports.deleteItem = function (assetid, callback) {
    const job = { type: 'delete', assetid: assetid };

    if (callback !== undefined) {
        job.callback = callback;
    }

    jobs.push(job);

    handleJobsQueue();
};

/**
 * Enqueues a sort job
 * @param {Number} type Sort type
 * @param {Function} [callback]
 */
exports.sortInventory = function (type, callback) {
    const job = { type: 'sort', sortType: type };

    if (callback !== undefined) {
        job.callback = callback;
    }

    jobs.push(job);

    handleJobsQueue();
};

/**
 * Connects to the TF2 Game Coordinator
 * @param {Function} callback
 */
exports.connectToGC = function (callback) {
    if (!isInTF2()) {
        log.debug('We are not playing TF2');
        client.gamesPlayed([440]);
    }

    if (tf2.haveGCSession) {
        log.debug('Already connected to TF2 GC');

        callback(null);
        return;
    }

    // Listen for connected event
    tf2.once('connectedToGC', connectedToGCEvent);

    const timeout = setTimeout(timeoutFired, 10000);

    function connectedToGCEvent () {
        clearTimeout(timeout);

        callback(null);
    }

    function timeoutFired () {
        tf2.removeListener('connectedToGC', connectedToGCEvent);

        log.debug('Failed to connect to TF2 GC');

        callback(new Error('Could not connect to GC'));
    }
};


/**
 * Handles the job queue
 */
function handleJobsQueue () {
    log.debug('Checking jobs queue', { is_processing: processingQueue, has_started_processing: startedProcessing, jobs: jobs.length });

    if (processingQueue) {
        log.debug('Already processing queue');
        return;
    } else if (jobs.length === 0) {
        log.debug('Queue is empty');
        if (startedProcessing) {
            log.debug('Done processing the queue');

            // We finished processing the job queue
            startedProcessing = false;

            client.gamesPlayed([]);

            handlerManager.getHandler().onTF2QueueCompleted();
        }
        return;
    }

    processingQueue = true;

    const job = jobs[0];

    if (!canProcessJob(job)) {
        // Can't process job, skip it
        log.debug('Can\'t process job', { job: job });
        doneProcessingJob(new Error('Can\'t process job'));
        return;
    }

    startedProcessing = true;

    log.debug('Ensuring TF2 GC connection...');

    exports.connectToGC(function (err) {
        if (err) {
            return doneProcessingJob(err);
        }

        if (job.type === 'crafting') {
            processCraftingJob(job, doneProcessingJob);
        } else if (job.type === 'use') {
            processUseJob(job, doneProcessingJob);
        } else if (job.type === 'delete') {
            processDeleteJob(job, doneProcessingJob);
        } else if (job.type === 'sort') {
            processSortJob(job, doneProcessingJob);
        } else {
            log.debug('Unknown job type', { job: job });
            doneProcessingJob(new Error('Unknown job type'));
        }
    });
}

/**
 * Checks if a specific job can be processed
 * @param {Object} job
 * @return {Boolean}
 */
function canProcessJob (job) {
    if (job.type === 'crafting') {
        const assetids = inventoryManager.findBySKU(job.defindex + ';6', false);
        // Checks if we have enough of the item
        return (job.smelt && assetids.length > 0) || (!job.smelt && assetids.length >= 3);
    } else if (job.type === 'use' || job.type === 'delete') {
        // Checks if we have the item
        return inventoryManager.findByAssetid(job.assetid) !== null;
    } else if (job.type === 'sort') {
        return typeof job.sortType === 'number';
    }

    return true;
}

/**
 * Function to call when done processing a job
 * @param {Error} err
 */
function doneProcessingJob (err) {
    const job = jobs.splice(0, 1)[0];

    if (job !== undefined && job.callback) {
        job.callback(err);
    }

    processingQueue = false;
    handleJobsQueue();
}

/**
 * Checks if we are playing TF2
 * @return {Boolean}
 */
function isInTF2 () {
    return client._playingAppIds.some((game) => game == 440);
}

/**
 * Processes a craft job
 * @param {Object} job
 * @param {Function} callback
 */
function processCraftingJob (job, callback) {
    if (!canProcessJob(job)) {
        callback(new Error('Can\'t process job'));
        return;
    }

    const assetids = inventoryManager.findBySKU(job.defindex + ';6', false);
    const ids = assetids.slice(0, job.smelt ? 1 : 3);

    log.debug('Sending craft request', { ids: ids });

    // TODO: Add recipe

    tf2.craft(ids);

    // Listen for the crafting to complete
    tf2.once('craftingComplete', craftingCompleteEvent);
    // Listen for GC disconnect
    tf2.once('disconnectedFromGC', disconnectedFromGCEvent);
    // Time out after 10 seconds
    const timeout = setTimeout(timeoutFired, 10000);

    function craftingCompleteEvent (recipe, itemsGained) {
        // The crafting was complete, remove used item and add the new items to the inventory
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);
        clearTimeout(timeout);

        for (let i = 0; i < ids.length; i++) {
            inventoryManager.removeItem(ids[i]);
        }

        const defindex = job.defindex + (job.smelt ? -1 : 1);
        const sku = defindex + ';6';

        for (let i = 0; i < itemsGained.length; i++) {
            inventoryManager.addItem(sku, itemsGained[i]);
        }

        handlerManager.getHandler().onCraftingCompleted(sku, itemsGained);

        return callback(null);
    }

    function disconnectedFromGCEvent () {
        // We disconnected from the GC, don't listen for the crafting to complete or not
        tf2.removeListener('craftingComplete', craftingCompleteEvent);
        clearTimeout(timeout);

        log.debug('Disconnected from GC while crafting', { job: job });

        return callback(new Error('Disconnected from GC'));
    }

    function timeoutFired () {
        // We have waited for 10 seconds and the event did not fire, remove the job and move on
        tf2.removeListener('craftingComplete', craftingCompleteEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);

        log.debug('Craft job timed out', { job: job });

        return callback(new Error('Job timed out'));
    }
}

/**
 * Processes a use job
 * @param {Object} job
 * @param {Function} callback
 */
function processUseJob (job, callback) {
    log.debug('Sending use request', { assetid: job.assetid });

    tf2.useItem(job.assetid);

    // Listen for the item to be removed
    tf2.on('itemRemoved', itemRemovedEvent);
    // Listen for GC disconnect
    tf2.once('disconnectedFromGC', disconnectedFromGCEvent);
    // Time out after 10 seconds
    const timeout = setTimeout(timeoutFired, 10000);

    function itemRemovedEvent (item) {
        // The crafting was complete, remove used item and add the new items to the inventory
        if (item.id != job.assetid) {
            return;
        }

        tf2.removeListener('itemRemoved', itemRemovedEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);
        clearTimeout(timeout);

        inventoryManager.removeItem(job.assetid);

        handlerManager.getHandler().onUseCompleted(job.assetid);

        return callback(null);
    }

    function disconnectedFromGCEvent () {
        // We disconnected from the GC, don't listen for the crafting to complete or not
        tf2.removeListener('itemRemoved', itemRemovedEvent);
        clearTimeout(timeout);

        log.debug('Disconnected from GC while using item', { job: job });

        return callback(new Error('Disconnected from GC'));
    }

    function timeoutFired () {
        // We have waited for 10 seconds and the event did not fire, remove the job and move on
        tf2.removeListener('itemRemoved', itemRemovedEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);

        log.debug('Use job timed out', { job: job });

        return callback(new Error('Job timed out'));
    }
}

function processDeleteJob (job, callback) {
    log.debug('Sending delete request', { assetid: job.assetid });

    tf2.deleteItem(job.assetid);

    // Listen for the item to be removed
    tf2.on('itemRemoved', itemRemovedEvent);
    // Listen for GC disconnect
    tf2.once('disconnectedFromGC', disconnectedFromGCEvent);
    // Time out after 10 seconds
    const timeout = setTimeout(timeoutFired, 10000);

    function itemRemovedEvent (item) {
        // The crafting was complete, remove used item and add the new items to the inventory
        if (item.id != job.assetid) {
            return;
        }

        tf2.removeListener('itemRemoved', itemRemovedEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);
        clearTimeout(timeout);

        inventoryManager.removeItem(job.assetid);

        handlerManager.getHandler().onDeleteCompleted(job.assetid);

        return callback(null);
    }

    function disconnectedFromGCEvent () {
        // We disconnected from the GC, don't listen for the crafting to complete or not
        tf2.removeListener('itemRemoved', itemRemovedEvent);
        clearTimeout(timeout);

        log.debug('Disconnected from GC while deleting item', { job: job });

        return callback(new Error('Disconnected from GC'));
    }

    function timeoutFired () {
        // We have waited for 10 seconds and the event did not fire, remove the job and move on
        tf2.removeListener('itemRemoved', itemRemovedEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);

        log.debug('Delete job timed out', { job: job });

        return callback(new Error('Job timed out'));
    }
}

function processSortJob (job, callback) {
    log.debug('Sorting inventory', { type: job.sortType });

    tf2.sortBackpack(job.sortType);

    // Listen for the items to be changed
    tf2.on('itemChanged', itemChangedEvent);
    // Listen for GC disconnect
    tf2.once('disconnectedFromGC', disconnectedFromGCEvent);
    // Time out after 3 seconds
    const failTimeout = setTimeout(timeoutFired, 3000);

    let timeout;

    function itemChangedEvent (item) {
        // One item has changed, clear all timeouts and set new timeout that will fire when inventory the is sorted
        clearTimeout(failTimeout);
        clearTimeout(timeout);

        timeout = setTimeout(function () {
            tf2.removeListener('itemChanged', itemChangedEvent);
            tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);
            callback(null);
        }, 1000);
    }

    function disconnectedFromGCEvent () {
        // We disconnected from the GC, don't listen for the crafting to complete or not
        tf2.removeListener('itemChanged', itemChangedEvent);
        clearTimeout(failTimeout);
        clearTimeout(timeout);

        log.debug('Disconnected from GC while sorting inventory', { job: job });

        return callback(new Error('Disconnected from GC'));
    }

    function timeoutFired () {
        // We have waited for 10 seconds and the event did not fire, remove the job and move on
        tf2.removeListener('itemRemoved', itemChangedEvent);
        tf2.removeListener('disconnectedFromGC', disconnectedFromGCEvent);
        clearTimeout(timeout);

        log.debug('Sort job timed out', { job: job });

        return callback(new Error('Job timed out'));
    }
}
