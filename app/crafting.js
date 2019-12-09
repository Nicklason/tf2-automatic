const log = require('lib/logger');
const client = require('lib/client');
const tf2 = require('lib/tf2');

const handlerManager = require('app/handler-manager');
const inventoryManager = require('app/inventory');

const craftJobs = [];

let processingQueue = false;
let startedProcessing = false;

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
        craftJobs.push({ smelt: true, defindex: defindex });
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
        craftJobs.push({ smelt: false, defindex: defindex });
    }

    handleJobsQueue();
};

/**
 * Processes a job
 * @param {Object} job
 * @return {Boolean|Array<String>} false if the job could not be made, and a list of assetids if it was made
 */
function processJob (job) {
    const assetids = inventoryManager.findBySKU(job.defindex + ';6', false);

    if ((job.smelt && assetids.length === 0) || (!job.smelt && assetids.length < 3)) {
        return false;
    }

    const ids = assetids.slice(0, job.smelt ? 1 : 3);

    log.debug('Sending craft request', { ids: ids });

    // TODO: Add recipe

    tf2.craft(ids);

    return ids;
}

/**
 * Handles the job queue
 */
function handleJobsQueue () {
    log.debug('Checking jobs queue', { is_processing: processingQueue, has_started_processing: startedProcessing, jobs: craftJobs.length });

    if (processingQueue) {
        return;
    } else if (craftJobs.length === 0) {
        if (startedProcessing) {
            // We finished processing the job queue
            startedProcessing = false;
            handlerManager.getHandler().onCraftingQueueCompleted();
        }
        return;
    }

    processingQueue = true;
    startedProcessing = true;

    const job = craftJobs[0];

    log.debug('Ensuring TF2 GC connection...');

    waitForGC(function (err) {
        if (err) {
            return done(false);
        }

        const ids = processJob(job);

        if (ids === false) {
            log.debug('Could not process');
            return done(true);
        }

        // Listen for the crafting to complete
        tf2.once('craftingComplete', craftingCompleteEvent);
        // Listen for GC disconnect
        tf2.once('disconnectedFromGC', disconnectedFromGCEvent);
        // Time out after 10 seconds
        const timeout = setTimeout(timeoutFired, 10000);

        function craftingCompleteEvent (recipe, itemsGained) {
            // The crafting was complete, remove used item and add the new items to the inventory
            tf2.off('disconnectedFromGC', disconnectedFromGCEvent);
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

            done(true);
        }

        function disconnectedFromGCEvent () {
            // We disconnected from the GC, don't listen for the crafting to complete or not
            tf2.off('craftingComplete', craftingCompleteEvent);
            clearTimeout(timeout);

            log.debug('Disconnected from GC while crafting', { job: job });

            done(true);
        }

        function timeoutFired () {
            // We have waited for 10 seconds and the event did not fire, remove the job and move on
            tf2.off('craftingComplete', craftingCompleteEvent);
            tf2.off('disconnectedFromGC', disconnectedFromGCEvent);

            log.debug('Craft job timed out', { job: job });

            done(true);
        }

        function done (finishedJob) {
            if (finishedJob) {
                craftJobs.splice(0, 1);
            }
            processingQueue = false;
            handleJobsQueue();
        }
    });
}

function waitForGC (callback) {
    const isInTF2 = client._playingAppIds.some((game) => game == 440);
    if (!isInTF2) {
        log.debug('We are not playing TF2');
        client.gamesPlayed([440]);
    }

    if (tf2.haveGCSession) {
        log.debug('Already connected to TF2 GC');

        callback(null);
        return;
    }

    // Listen for connected event
    tf2.on('connectedToGC', connectedToGCEvent);

    const timeout = setTimeout(timeoutFired, 10000);

    function connectedToGCEvent () {
        clearTimeout(timeout);

        callback(null);
    }

    function timeoutFired () {
        tf2.off('connectedToGC', connectedToGCEvent);

        log.debug('Failed to connect to TF2 GC');

        callback(new Error('Could not connect to GC'));
    }
}
