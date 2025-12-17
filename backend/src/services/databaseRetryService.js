/**
 * Database Retry Service
 * Design Decision: Centralized retry logic for database operations
 * Rationale: Handles transient failures gracefully while ensuring data consistency
 * 
 * Requirements: 10.4
 */

const mongoose = require('mongoose');
const { createLogger } = require('./loggerService');

const logger = createLogger('database');

// Retry configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 5000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Transient error codes that should trigger a retry
 */
const TRANSIENT_ERROR_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'EHOSTUNREACH',
  'EAI_AGAIN'
];

/**
 * MongoDB error codes that indicate transient failures
 */
const TRANSIENT_MONGO_CODES = [
  6,     // HostUnreachable
  7,     // HostNotFound
  89,    // NetworkTimeout
  91,    // ShutdownInProgress
  189,   // PrimarySteppedDown
  262,   // ExceededTimeLimit
  9001,  // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436  // NotMasterOrSecondary
];

/**
 * Check if an error is transient and should be retried
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is transient
 */
const isTransientError = (error) => {
  // Check error code
  if (error.code && TRANSIENT_ERROR_CODES.includes(error.code)) {
    return true;
  }
  
  // Check MongoDB error code
  if (error.code && TRANSIENT_MONGO_CODES.includes(error.code)) {
    return true;
  }
  
  // Check for write concern errors
  if (error.name === 'MongoWriteConcernError') {
    return true;
  }
  
  // Check for network errors
  if (error.name === 'MongoNetworkError') {
    return true;
  }
  
  // Check error message for common transient patterns
  const transientPatterns = [
    /connection.*reset/i,
    /connection.*refused/i,
    /connection.*timeout/i,
    /socket.*closed/i,
    /network.*error/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i
  ];
  
  return transientPatterns.some(pattern => pattern.test(error.message));
};


/**
 * Calculate delay for next retry using exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @returns {number} Delay in milliseconds
 */
const calculateBackoffDelay = (attempt, initialDelay = DEFAULT_INITIAL_DELAY_MS, maxDelay = DEFAULT_MAX_DELAY_MS) => {
  const delay = initialDelay * Math.pow(BACKOFF_MULTIPLIER, attempt);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelay);
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute a database operation with retry logic
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelay - Initial delay in ms
 * @param {number} options.maxDelay - Maximum delay in ms
 * @param {string} options.operationName - Name for logging
 * @returns {Promise<*>} Operation result
 */
const withRetry = async (operation, options = {}) => {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelay = DEFAULT_INITIAL_DELAY_MS,
    maxDelay = DEFAULT_MAX_DELAY_MS,
    operationName = 'database operation'
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry if not a transient error
      if (!isTransientError(error)) {
        logger.dbError(operationName, error);
        throw error;
      }
      
      // Don't retry if we've exhausted retries
      if (attempt >= maxRetries) {
        logger.error(`${operationName} failed after ${maxRetries + 1} attempts`, {
          errorMessage: error.message,
          errorCode: error.code
        });
        throw error;
      }
      
      // Calculate delay and wait
      const delay = calculateBackoffDelay(attempt, initialDelay, maxDelay);
      logger.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`, {
        errorMessage: error.message,
        errorCode: error.code
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Execute a database transaction with retry logic
 * Ensures no partial writes on failure
 * @param {Function} transactionFn - Function that receives session and performs operations
 * @param {Object} options - Retry options
 * @returns {Promise<*>} Transaction result
 */
const withTransaction = async (transactionFn, options = {}) => {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    operationName = 'transaction'
  } = options;
  
  return withRetry(async () => {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' }
      });
      
      const result = await transactionFn(session);
      
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }, { ...options, operationName });
};


/**
 * Create a retryable version of a model method
 * @param {mongoose.Model} Model - Mongoose model
 * @param {string} methodName - Method name to wrap
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped method with retry logic
 */
const createRetryableMethod = (Model, methodName, options = {}) => {
  const originalMethod = Model[methodName].bind(Model);
  
  return async (...args) => {
    return withRetry(
      () => originalMethod(...args),
      { ...options, operationName: `${Model.modelName}.${methodName}` }
    );
  };
};

/**
 * Wrap common model operations with retry logic
 * @param {mongoose.Model} Model - Mongoose model to wrap
 * @param {Object} options - Retry options
 * @returns {Object} Object with retryable methods
 */
const createRetryableModel = (Model, options = {}) => {
  return {
    findById: createRetryableMethod(Model, 'findById', options),
    findOne: createRetryableMethod(Model, 'findOne', options),
    find: createRetryableMethod(Model, 'find', options),
    create: createRetryableMethod(Model, 'create', options),
    findByIdAndUpdate: createRetryableMethod(Model, 'findByIdAndUpdate', options),
    findOneAndUpdate: createRetryableMethod(Model, 'findOneAndUpdate', options),
    findByIdAndDelete: createRetryableMethod(Model, 'findByIdAndDelete', options),
    findOneAndDelete: createRetryableMethod(Model, 'findOneAndDelete', options),
    updateOne: createRetryableMethod(Model, 'updateOne', options),
    updateMany: createRetryableMethod(Model, 'updateMany', options),
    deleteOne: createRetryableMethod(Model, 'deleteOne', options),
    deleteMany: createRetryableMethod(Model, 'deleteMany', options),
    countDocuments: createRetryableMethod(Model, 'countDocuments', options),
    aggregate: createRetryableMethod(Model, 'aggregate', options)
  };
};

/**
 * Save a document with retry logic
 * @param {mongoose.Document} doc - Document to save
 * @param {Object} options - Retry options
 * @returns {Promise<mongoose.Document>} Saved document
 */
const saveWithRetry = async (doc, options = {}) => {
  return withRetry(
    () => doc.save(),
    { ...options, operationName: `${doc.constructor.modelName}.save` }
  );
};

/**
 * Execute a bulk write operation with retry logic
 * @param {mongoose.Model} Model - Mongoose model
 * @param {Array} operations - Bulk operations
 * @param {Object} options - Retry and bulk write options
 * @returns {Promise<Object>} Bulk write result
 */
const bulkWriteWithRetry = async (Model, operations, options = {}) => {
  const { maxRetries, initialDelay, maxDelay, ...bulkOptions } = options;
  
  return withRetry(
    () => Model.bulkWrite(operations, bulkOptions),
    { maxRetries, initialDelay, maxDelay, operationName: `${Model.modelName}.bulkWrite` }
  );
};

module.exports = {
  withRetry,
  withTransaction,
  createRetryableMethod,
  createRetryableModel,
  saveWithRetry,
  bulkWriteWithRetry,
  isTransientError,
  calculateBackoffDelay,
  TRANSIENT_ERROR_CODES,
  TRANSIENT_MONGO_CODES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_MAX_DELAY_MS
};
