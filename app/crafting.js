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
        return;
    }

    for (let i = 0; i < amount; i++) {
        craftJobs.push({ action: 'smelt', defindex: defindex });
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
        return;
    }

    for (let i = 0; i < amount; i++) {
        craftJobs.push({ action: 'combine', defindex: defindex });
    }

    handleJobsQueue();
};

/**
 * Processes a job
 * @param {Object} job
 * @return {Boolean|Array<String>} false if the job could not be made, and a list of assetids if it was made
 */
function processJob (job) {
    if (job.action === 'smelt' || job.action === 'combine') {
        const assetids = inventoryManager.findBySKU(job.defindex + ';6', false);

        const smelting = job.action === 'smelt';
        if ((smelting && assetids.length === 0) || (!smelting && assetids.length < 3)) {
            return false;
        }

        const ids = assetids.slice(0, smelting ? 1 : 3);

        tf2.craft(ids);

        return ids;
    }

    return false;
}

/**
 * Handles the job queue
 */
function handleJobsQueue () {
    if (processingQueue) {
        return;
    } else if (startedProcessing && craftJobs.length === 0) {
        // We finished processing the job queue
        startedProcessing = false;
        handlerManager.getHandler().onCraftingQueueCompleted();
        return;
    }

    processingQueue = true;
    startedProcessing = true;

    const job = craftJobs[0];

    waitForGC(function (err) {
        if (err) {
            return done(false);
        }

        const ids = processJob(job);

        if (ids === false) {
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

            done(true);
        }

        function timeoutFired () {
            // We have waited for 10 seconds and the event did not fire, remove the job and move on
            tf2.off('craftingComplete', craftingCompleteEvent);
            tf2.off('disconnectedFromGC', disconnectedFromGCEvent);

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
        client.gamesPlayed([440]);
    }

    if (tf2.haveGCSession) {
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

        callback(new Error('Could not connect to GC'));
    }
}
