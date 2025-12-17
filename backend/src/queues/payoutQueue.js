/**
 * Payout Processing Queue Module
 * Handles background processing of driver payouts using BullMQ
 * Implements retry with exponential backoff for failed payouts
 * 
 * Requirements: 6.5 - Queue failed payouts for retry and notify admin
 */

const { Queue, Worker, QueueEvents } = require('bullmq');

// Queue configuration
const QUEUE_NAME = 'payout-processing';

// Job options for payout processing with exponential backoff
const DEFAULT_JOB_OPTIONS = {
  attempts: 5, // More attempts for payouts
  backoff: {
    type: 'exponential',
    delay: 5000 // Start with 5 seconds, then 10s, 20s, 40s, 80s
  },
  removeOnComplete: {
    count: 500,
    age: 7 * 24 * 3600 // Keep completed jobs for 7 days
  },
  removeOnFail: {
    count: 1000,
    age: 30 * 24 * 3600 // Keep failed jobs for 30 days for audit
  }
};

// Queue instance
let payoutQueue = null;
let queueEvents = null;
let payoutWorker = null;

/**
 * Get Redis connection options for BullMQ
 * @returns {Object} Redis connection configuration
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Parse Redis URL
  const url = new URL(redisUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null // Required for BullMQ
  };
};

/**
 * Initialize the payout processing queue
 * @returns {Queue} BullMQ Queue instance
 */
const initializePayoutQueue = () => {
  if (payoutQueue) {
    return payoutQueue;
  }

  const connection = getRedisConnection();

  payoutQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });

  // Initialize queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  // Log queue events
  queueEvents.on('completed', ({ jobId }) => {
    console.log(`[PayoutQueue] Job ${jobId} completed successfully`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[PayoutQueue] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }) => {
    console.warn(`[PayoutQueue] Job ${jobId} stalled`);
  });

  console.log('✓ Payout processing queue initialized');
  return payoutQueue;
};

/**
 * Get the payout queue instance
 * @returns {Queue|null} Queue instance or null if not initialized
 */
const getPayoutQueue = () => {
  if (!payoutQueue) {
    return initializePayoutQueue();
  }
  return payoutQueue;
};


/**
 * Add a payout job to the queue
 * @param {Object} payoutData - Payout data
 * @param {string} payoutData.tripId - Trip ID
 * @param {string} payoutData.driverId - Driver ID
 * @param {number} payoutData.amount - Payout amount
 * @param {string} payoutData.beneficiaryId - Cashfree beneficiary ID
 * @param {string} payoutData.transactionId - Transaction ID for tracking
 * @param {Object} [options] - Additional job options
 * @returns {Promise<Object>} Job info
 * 
 * Requirements: 6.5 - Queue failed payouts for retry
 */
const addPayoutJob = async (payoutData, options = {}) => {
  const queue = getPayoutQueue();
  
  if (!queue) {
    throw new Error('Payout queue not available');
  }

  const jobOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: payoutData.transactionId || `payout_${payoutData.tripId}_${Date.now()}`
  };

  const job = await queue.add('process-payout', {
    ...payoutData,
    queuedAt: new Date().toISOString(),
    retryCount: 0
  }, jobOptions);

  console.log(`[PayoutQueue] Payout job ${job.id} added for driver ${payoutData.driverId}`);

  return {
    jobId: job.id,
    status: 'queued',
    message: 'Payout queued for processing'
  };
};

/**
 * Add a failed payout to retry queue
 * Called when initial payout attempt fails
 * 
 * @param {Object} payoutData - Failed payout data
 * @param {string} failureReason - Reason for failure
 * @returns {Promise<Object>} Queue result
 * 
 * Requirements: 6.5 - Queue failed payouts for retry
 */
const queueFailedPayout = async (payoutData, failureReason) => {
  const queue = getPayoutQueue();
  
  if (!queue) {
    console.error('[PayoutQueue] Queue not available, cannot queue failed payout');
    return {
      success: false,
      error: 'Queue not available'
    };
  }

  const jobData = {
    ...payoutData,
    failureReason,
    originalFailedAt: new Date().toISOString(),
    retryCount: (payoutData.retryCount || 0) + 1
  };

  const job = await queue.add('retry-payout', jobData, {
    ...DEFAULT_JOB_OPTIONS,
    delay: calculateBackoffDelay(jobData.retryCount),
    jobId: `retry_${payoutData.transactionId || payoutData.tripId}_${Date.now()}`
  });

  console.log(`[PayoutQueue] Failed payout queued for retry: ${job.id}, attempt ${jobData.retryCount}`);

  return {
    success: true,
    jobId: job.id,
    retryCount: jobData.retryCount,
    nextRetryAt: new Date(Date.now() + calculateBackoffDelay(jobData.retryCount))
  };
};

/**
 * Calculate exponential backoff delay
 * @param {number} retryCount - Current retry count
 * @returns {number} Delay in milliseconds
 */
const calculateBackoffDelay = (retryCount) => {
  const baseDelay = 5000; // 5 seconds
  const maxDelay = 300000; // 5 minutes max
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  return delay;
};

/**
 * Send admin notification for payout failure
 * Called when payout fails after all retry attempts
 * 
 * @param {Object} payoutData - Failed payout data
 * @param {string} failureReason - Final failure reason
 * @returns {Promise<void>}
 * 
 * Requirements: 6.5 - Notify admin on payout failure
 */
const notifyAdminPayoutFailure = async (payoutData, failureReason) => {
  try {
    // Import notification service
    const notificationService = require('../services/notificationService');
    
    // Get admin users (super admins)
    const User = require('../models/User');
    const admins = await User.find({ 
      role: { $in: ['super_admin', 'admin'] },
      isActive: true 
    }).select('email phone');

    const notificationData = {
      tripId: payoutData.tripId,
      driverId: payoutData.driverId,
      amount: payoutData.amount,
      transactionId: payoutData.transactionId,
      failureReason,
      failedAt: new Date().toISOString(),
      retryCount: payoutData.retryCount || 0
    };

    // Send email notification to admins
    for (const admin of admins) {
      if (admin.email) {
        await notificationService.sendNotification({
          userId: admin._id,
          channel: 'email',
          template: 'payout_failure_admin',
          recipient: admin.email,
          data: notificationData,
          relatedEntity: {
            type: 'payout',
            id: payoutData.transactionId
          }
        });
      }
    }

    console.log(`[PayoutQueue] Admin notification sent for failed payout: ${payoutData.transactionId}`);
    
  } catch (error) {
    console.error('[PayoutQueue] Failed to send admin notification:', error);
  }
};

/**
 * Get current queue status
 * @returns {Promise<Object>} Queue statistics
 */
const getPayoutQueueStatus = async () => {
  const queue = getPayoutQueue();
  
  if (!queue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false
    };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: await queue.isPaused()
  };
};

/**
 * Get failed payout jobs for review
 * @param {number} [start=0] - Start index
 * @param {number} [end=20] - End index
 * @returns {Promise<Array>} Failed jobs
 */
const getFailedPayouts = async (start = 0, end = 20) => {
  const queue = getPayoutQueue();
  if (!queue) return [];

  const jobs = await queue.getFailed(start, end);
  return jobs.map(job => ({
    id: job.id,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn
  }));
};

/**
 * Retry a failed payout job
 * @param {string} jobId - Job ID to retry
 * @returns {Promise<boolean>} Success status
 */
const retryFailedPayout = async (jobId) => {
  const queue = getPayoutQueue();
  if (!queue) return false;

  const job = await queue.getJob(jobId);
  if (job) {
    await job.retry();
    return true;
  }
  return false;
};

/**
 * Close the queue and events
 * @returns {Promise<void>}
 */
const closePayoutQueue = async () => {
  if (payoutWorker) {
    await payoutWorker.close();
    payoutWorker = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (payoutQueue) {
    await payoutQueue.close();
    payoutQueue = null;
  }
  console.log('Payout queue closed');
};

module.exports = {
  initializePayoutQueue,
  getPayoutQueue,
  addPayoutJob,
  queueFailedPayout,
  calculateBackoffDelay,
  notifyAdminPayoutFailure,
  getPayoutQueueStatus,
  getFailedPayouts,
  retryFailedPayout,
  closePayoutQueue,
  QUEUE_NAME,
  DEFAULT_JOB_OPTIONS
};
