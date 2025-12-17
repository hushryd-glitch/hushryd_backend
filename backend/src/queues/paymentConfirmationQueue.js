/**
 * Payment Confirmation Queue Module
 * Handles queuing and processing of payment confirmations when Cashfree API times out
 * Implements reconciliation job to poll Cashfree for status
 * 
 * Requirements: 10.2 - Queue payment confirmations when API times out
 * Requirements: 10.4 - Poll Cashfree API to reconcile payment status
 * Requirements: 10.5 - Process queued payments on system recovery
 */

const { Queue, Worker, QueueEvents } = require('bullmq');

// Queue configuration
const QUEUE_NAME = 'payment-confirmation';

// Job options for payment confirmation processing
const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 10000 // Start with 10 seconds
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

// Reconciliation job options
const RECONCILIATION_JOB_OPTIONS = {
  repeat: {
    every: 60000 // Run every 60 seconds
  },
  jobId: 'payment-reconciliation-job'
};

// Queue instance
let paymentConfirmationQueue = null;
let queueEvents = null;
let reconciliationWorker = null;

/**
 * Get Redis connection options for BullMQ
 * @returns {Object} Redis connection configuration
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null
    };
  } catch (error) {
    // Fallback for simple redis URLs
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null
    };
  }
};

/**
 * Initialize the payment confirmation queue
 * @returns {Queue} BullMQ Queue instance
 */
const initializePaymentConfirmationQueue = () => {
  if (paymentConfirmationQueue) {
    return paymentConfirmationQueue;
  }

  const connection = getRedisConnection();

  paymentConfirmationQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });

  // Initialize queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`[PaymentConfirmationQueue] Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[PaymentConfirmationQueue] Job ${jobId} failed: ${failedReason}`);
  });

  console.log('✓ Payment confirmation queue initialized');
  return paymentConfirmationQueue;
};

/**
 * Get the payment confirmation queue instance
 * @returns {Queue|null} Queue instance
 */
const getPaymentConfirmationQueue = () => {
  if (!paymentConfirmationQueue) {
    return initializePaymentConfirmationQueue();
  }
  return paymentConfirmationQueue;
};


/**
 * Queue a payment confirmation for later processing
 * Called when Cashfree API times out or circuit breaker is open
 * 
 * Requirements: 10.2 - Queue payment confirmations when API times out
 * 
 * @param {Object} confirmationData - Payment confirmation data
 * @param {string} confirmationData.orderId - Cashfree order ID
 * @param {string} confirmationData.bookingId - Booking ID
 * @param {string} confirmationData.tripId - Trip ID
 * @param {string} confirmationData.transactionId - Transaction ID
 * @param {number} confirmationData.amount - Payment amount
 * @param {string} confirmationData.type - Confirmation type (payment, capture, refund)
 * @param {string} confirmationData.reason - Reason for queuing (timeout, circuit_open)
 * @param {Object} [options] - Additional job options
 * @returns {Promise<Object>} Queue result
 */
const queuePaymentConfirmation = async (confirmationData, options = {}) => {
  const queue = getPaymentConfirmationQueue();
  
  if (!queue) {
    console.error('[PaymentConfirmationQueue] Queue not available');
    return {
      success: false,
      queued: false,
      error: 'Queue not available'
    };
  }

  const jobData = {
    ...confirmationData,
    queuedAt: new Date().toISOString(),
    status: 'pending',
    reconciliationAttempts: 0
  };

  const jobOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: confirmationData.transactionId || `confirm_${confirmationData.orderId}_${Date.now()}`
  };

  try {
    const job = await queue.add('confirm-payment', jobData, jobOptions);

    console.log(`[PaymentConfirmationQueue] Payment confirmation queued: ${job.id}, orderId: ${confirmationData.orderId}`);

    return {
      success: true,
      queued: true,
      jobId: job.id,
      orderId: confirmationData.orderId,
      message: 'Payment confirmation queued for reconciliation'
    };
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to queue payment confirmation:', error);
    return {
      success: false,
      queued: false,
      error: error.message
    };
  }
};

/**
 * Queue a payment status reconciliation request
 * Used to poll Cashfree API for uncertain payment status
 * 
 * Requirements: 10.4 - Poll Cashfree API to reconcile payment status
 * 
 * @param {Object} reconciliationData - Reconciliation data
 * @param {string} reconciliationData.orderId - Cashfree order ID
 * @param {string} reconciliationData.transactionId - Transaction ID
 * @param {string} reconciliationData.expectedStatus - Expected payment status
 * @returns {Promise<Object>} Queue result
 */
const queueReconciliation = async (reconciliationData) => {
  const queue = getPaymentConfirmationQueue();
  
  if (!queue) {
    return {
      success: false,
      error: 'Queue not available'
    };
  }

  const jobData = {
    ...reconciliationData,
    type: 'reconciliation',
    queuedAt: new Date().toISOString(),
    attempts: 0
  };

  try {
    const job = await queue.add('reconcile-payment', jobData, {
      ...DEFAULT_JOB_OPTIONS,
      priority: 1, // Higher priority for reconciliation
      jobId: `reconcile_${reconciliationData.orderId}_${Date.now()}`
    });

    return {
      success: true,
      jobId: job.id,
      message: 'Reconciliation request queued'
    };
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to queue reconciliation:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Start the reconciliation scheduler
 * Periodically checks for pending payment confirmations and reconciles them
 * 
 * Requirements: 10.4, 10.5 - Reconciliation job to poll Cashfree for status
 * 
 * @returns {Promise<void>}
 */
const startReconciliationScheduler = async () => {
  const queue = getPaymentConfirmationQueue();
  
  if (!queue) {
    console.error('[PaymentConfirmationQueue] Cannot start scheduler - queue not available');
    return;
  }

  // Add recurring reconciliation job
  try {
    await queue.add('scheduled-reconciliation', {
      type: 'scheduled',
      scheduledAt: new Date().toISOString()
    }, RECONCILIATION_JOB_OPTIONS);

    console.log('[PaymentConfirmationQueue] Reconciliation scheduler started');
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to start reconciliation scheduler:', error);
  }
};

/**
 * Stop the reconciliation scheduler
 * @returns {Promise<void>}
 */
const stopReconciliationScheduler = async () => {
  const queue = getPaymentConfirmationQueue();
  
  if (queue) {
    try {
      await queue.removeRepeatableByKey('scheduled-reconciliation');
      console.log('[PaymentConfirmationQueue] Reconciliation scheduler stopped');
    } catch (error) {
      console.error('[PaymentConfirmationQueue] Failed to stop scheduler:', error);
    }
  }
};

/**
 * Get pending payment confirmations
 * @param {number} [limit=50] - Maximum items to return
 * @returns {Promise<Array>} Pending confirmation jobs
 */
const getPendingConfirmations = async (limit = 50) => {
  const queue = getPaymentConfirmationQueue();
  if (!queue) return [];

  try {
    const jobs = await queue.getWaiting(0, limit);
    return jobs.map(job => ({
      id: job.id,
      orderId: job.data.orderId,
      bookingId: job.data.bookingId,
      tripId: job.data.tripId,
      amount: job.data.amount,
      type: job.data.type,
      queuedAt: job.data.queuedAt,
      attempts: job.attemptsMade
    }));
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to get pending confirmations:', error);
    return [];
  }
};

/**
 * Get queue status
 * @returns {Promise<Object>} Queue statistics
 */
const getPaymentConfirmationQueueStatus = async () => {
  const queue = getPaymentConfirmationQueue();
  
  if (!queue) {
    return {
      available: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    };
  }

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      available: true,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: await queue.isPaused()
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
};

/**
 * Get failed payment confirmations for review
 * @param {number} [start=0] - Start index
 * @param {number} [end=20] - End index
 * @returns {Promise<Array>} Failed jobs
 */
const getFailedConfirmations = async (start = 0, end = 20) => {
  const queue = getPaymentConfirmationQueue();
  if (!queue) return [];

  try {
    const jobs = await queue.getFailed(start, end);
    return jobs.map(job => ({
      id: job.id,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn
    }));
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to get failed confirmations:', error);
    return [];
  }
};

/**
 * Retry a failed payment confirmation
 * @param {string} jobId - Job ID to retry
 * @returns {Promise<boolean>} Success status
 */
const retryFailedConfirmation = async (jobId) => {
  const queue = getPaymentConfirmationQueue();
  if (!queue) return false;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
      return true;
    }
    return false;
  } catch (error) {
    console.error('[PaymentConfirmationQueue] Failed to retry job:', error);
    return false;
  }
};

/**
 * Close the queue and cleanup resources
 * @returns {Promise<void>}
 */
const closePaymentConfirmationQueue = async () => {
  if (reconciliationWorker) {
    await reconciliationWorker.close();
    reconciliationWorker = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (paymentConfirmationQueue) {
    await paymentConfirmationQueue.close();
    paymentConfirmationQueue = null;
  }
  console.log('[PaymentConfirmationQueue] Queue closed');
};

module.exports = {
  initializePaymentConfirmationQueue,
  getPaymentConfirmationQueue,
  queuePaymentConfirmation,
  queueReconciliation,
  startReconciliationScheduler,
  stopReconciliationScheduler,
  getPendingConfirmations,
  getPaymentConfirmationQueueStatus,
  getFailedConfirmations,
  retryFailedConfirmation,
  closePaymentConfirmationQueue,
  QUEUE_NAME,
  DEFAULT_JOB_OPTIONS,
  RECONCILIATION_JOB_OPTIONS
};
