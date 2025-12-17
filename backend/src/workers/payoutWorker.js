/**
 * Payout Worker
 * Processes queued payout jobs with retry logic
 * 
 * Requirements: 6.5 - Process queued payouts with exponential backoff
 */

const { Worker } = require('bullmq');
const { QUEUE_NAME, notifyAdminPayoutFailure } = require('../queues/payoutQueue');
const cashfreeService = require('../services/cashfreeService');
const Transaction = require('../models/Transaction');
const Driver = require('../models/Driver');

let payoutWorker = null;

/**
 * Get Redis connection options for BullMQ
 * @returns {Object} Redis connection configuration
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null
  };
};

/**
 * Process a payout job
 * @param {Object} job - BullMQ job
 * @returns {Promise<Object>} Processing result
 */
const processPayoutJob = async (job) => {
  const { 
    tripId, 
    driverId, 
    amount, 
    beneficiaryId, 
    transactionId,
    retryCount = 0 
  } = job.data;

  console.log(`[PayoutWorker] Processing payout job ${job.id} for driver ${driverId}, attempt ${retryCount + 1}`);

  try {
    // Generate unique transfer ID for this attempt
    const transferId = `PAYOUT_${tripId}_RETRY_${Date.now()}`;
    
    // Attempt payout via Cashfree
    const payoutResult = await cashfreeService.initiatePayout({
      beneficiaryId,
      amount,
      transferId,
      transferMode: 'IMPS',
      remarks: `HushRyd earnings retry for trip ${tripId}`
    });

    // Update transaction status to completed
    if (transactionId) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        {
          status: 'completed',
          'cashfreeData.payoutId': payoutResult.transferId,
          'cashfreeData.referenceId': payoutResult.referenceId,
          'metadata.completedAt': new Date(),
          'metadata.completedOnRetry': retryCount + 1
        }
      );
    }

    // Update driver earnings - move from pending to total
    await Driver.findByIdAndUpdate(driverId, {
      $inc: {
        'earnings.total': amount,
        'earnings.pending': -amount
      }
    });

    console.log(`[PayoutWorker] Payout successful for driver ${driverId}: ${payoutResult.transferId}`);

    return {
      success: true,
      transferId: payoutResult.transferId,
      amount
    };

  } catch (error) {
    console.error(`[PayoutWorker] Payout failed for driver ${driverId}:`, error.message);

    // Update transaction with failure info
    if (transactionId) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        {
          $push: {
            'metadata.retryAttempts': {
              attempt: retryCount + 1,
              error: error.message,
              timestamp: new Date()
            }
          }
        }
      );
    }

    // Re-throw to trigger BullMQ retry
    throw error;
  }
};

/**
 * Handle job completion
 * @param {Object} job - Completed job
 * @param {Object} result - Job result
 */
const onJobCompleted = async (job, result) => {
  console.log(`[PayoutWorker] Job ${job.id} completed successfully:`, result);
};

/**
 * Handle job failure (after all retries exhausted)
 * @param {Object} job - Failed job
 * @param {Error} error - Failure error
 */
const onJobFailed = async (job, error) => {
  console.error(`[PayoutWorker] Job ${job.id} failed permanently:`, error.message);

  const { tripId, driverId, amount, transactionId, retryCount } = job.data;

  // Update transaction status to failed
  if (transactionId) {
    await Transaction.findOneAndUpdate(
      { transactionId },
      {
        status: 'failed',
        'metadata.finalFailure': {
          error: error.message,
          timestamp: new Date(),
          totalAttempts: (retryCount || 0) + 1
        }
      }
    );
  }

  // Send final admin notification (Requirements: 6.5)
  await notifyAdminPayoutFailure({
    tripId,
    driverId,
    amount,
    transactionId,
    retryCount: (retryCount || 0) + 1
  }, `Final failure after all retries: ${error.message}`);
};

/**
 * Initialize the payout worker
 * @returns {Worker} BullMQ Worker instance
 */
const initializePayoutWorker = () => {
  if (payoutWorker) {
    return payoutWorker;
  }

  const connection = getRedisConnection();

  payoutWorker = new Worker(
    QUEUE_NAME,
    processPayoutJob,
    {
      connection,
      concurrency: 5, // Process up to 5 payouts concurrently
      limiter: {
        max: 10,
        duration: 1000 // Max 10 jobs per second to avoid rate limiting
      }
    }
  );

  // Event handlers
  payoutWorker.on('completed', onJobCompleted);
  payoutWorker.on('failed', onJobFailed);

  payoutWorker.on('error', (error) => {
    console.error('[PayoutWorker] Worker error:', error);
  });

  console.log('✓ Payout worker initialized');
  return payoutWorker;
};

/**
 * Get the payout worker instance
 * @returns {Worker|null} Worker instance
 */
const getPayoutWorker = () => payoutWorker;

/**
 * Close the payout worker
 * @returns {Promise<void>}
 */
const closePayoutWorker = async () => {
  if (payoutWorker) {
    await payoutWorker.close();
    payoutWorker = null;
    console.log('Payout worker closed');
  }
};

module.exports = {
  initializePayoutWorker,
  getPayoutWorker,
  closePayoutWorker,
  processPayoutJob
};
