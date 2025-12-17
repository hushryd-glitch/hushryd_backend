/**
 * Document Processing Queue Module
 * Handles background processing of uploaded documents using BullMQ
 * 
 * Design Decision: BullMQ with Redis for guaranteed delivery
 * Rationale: Handles 7K+ concurrent uploads without blocking API
 * 
 * Requirements: 1.3, 1.5 - Queue document processing with retry and guaranteed delivery
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { getRedisClient, isRedisConnected } = require('../config/redis');

// Queue configuration
const QUEUE_NAME = 'document-processing';

// Job options for document processing
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600 // Keep completed jobs for 24 hours
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 3600 // Keep failed jobs for 7 days
  }
};

// Queue instance
let documentQueue = null;
let queueEvents = null;

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
 * Initialize the document processing queue
 * @returns {Queue} BullMQ Queue instance
 */
const initializeDocumentQueue = () => {
  if (documentQueue) {
    return documentQueue;
  }

  const connection = getRedisConnection();

  documentQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });

  // Initialize queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  // Log queue events
  queueEvents.on('completed', ({ jobId }) => {
    console.log(`Document job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`Document job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.on('stalled', ({ jobId }) => {
    console.warn(`Document job ${jobId} stalled`);
  });

  console.log('✓ Document processing queue initialized');
  return documentQueue;
};

/**
 * Get the document queue instance
 * @returns {Queue|null} Queue instance or null if not initialized
 */
const getDocumentQueue = () => {
  if (!documentQueue) {
    return initializeDocumentQueue();
  }
  return documentQueue;
};

/**
 * Add a document processing job to the queue
 * @param {Object} documentData - Document data to process
 * @param {string} documentData.userId - User ID
 * @param {string} documentData.driverId - Driver ID
 * @param {string} documentData.documentId - Document ID
 * @param {string} documentData.documentType - Type of document
 * @param {string} documentData.s3Key - S3 object key
 * @param {Object} [options] - Additional job options
 * @returns {Promise<Object>} Job info with queue position
 * 
 * Requirements: 1.3 - Queue document for processing with guaranteed delivery
 */
const addDocumentJob = async (documentData, options = {}) => {
  const queue = getDocumentQueue();
  
  if (!queue) {
    throw new Error('Document queue not available');
  }

  const jobOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...options
  };

  const job = await queue.add('process-document', documentData, jobOptions);

  // Get queue position for user feedback
  const queueInfo = await getQueueStatus();

  return {
    jobId: job.id,
    queuePosition: queueInfo.waiting + 1,
    estimatedWaitMinutes: Math.ceil((queueInfo.waiting + 1) / 100) // ~100 docs/min
  };
};

/**
 * Get current queue status
 * @returns {Promise<Object>} Queue statistics
 * 
 * Requirements: 9.4 - Return queue depth, processing rate, failed jobs
 */
const getQueueStatus = async () => {
  const queue = getDocumentQueue();
  
  if (!queue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
      processingRate: 0
    };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  // Calculate processing rate (jobs completed in last minute)
  const processingRate = await calculateProcessingRate();

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: await queue.isPaused(),
    processingRate,
    estimatedWaitMinutes: processingRate > 0 ? Math.ceil(waiting / processingRate) : 0
  };
};

/**
 * Calculate processing rate (jobs per minute)
 * @returns {Promise<number>} Jobs processed per minute
 */
const calculateProcessingRate = async () => {
  const queue = getDocumentQueue();
  if (!queue) return 0;

  try {
    // Get completed jobs from last minute
    const oneMinuteAgo = Date.now() - 60000;
    const completedJobs = await queue.getCompleted(0, 100);
    
    const recentJobs = completedJobs.filter(job => 
      job.finishedOn && job.finishedOn > oneMinuteAgo
    );

    return recentJobs.length;
  } catch (error) {
    console.error('Error calculating processing rate:', error);
    return 100; // Default estimate
  }
};

/**
 * Get failed jobs for review
 * @param {number} [start=0] - Start index
 * @param {number} [end=10] - End index
 * @returns {Promise<Array>} Failed jobs
 */
const getFailedJobs = async (start = 0, end = 10) => {
  const queue = getDocumentQueue();
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
 * Retry a failed job
 * @param {string} jobId - Job ID to retry
 * @returns {Promise<boolean>} Success status
 */
const retryFailedJob = async (jobId) => {
  const queue = getDocumentQueue();
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
const closeQueue = async () => {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (documentQueue) {
    await documentQueue.close();
    documentQueue = null;
  }
  console.log('Document queue closed');
};

module.exports = {
  initializeDocumentQueue,
  getDocumentQueue,
  addDocumentJob,
  getQueueStatus,
  getFailedJobs,
  retryFailedJob,
  closeQueue,
  QUEUE_NAME,
  DEFAULT_JOB_OPTIONS
};
