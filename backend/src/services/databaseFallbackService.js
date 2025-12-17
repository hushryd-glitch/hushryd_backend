/**
 * Database Fallback Service
 * Handles database operations with Redis cache fallback
 * Requirements: 3.5 - Serve cached data when DB unavailable, queue writes for retry
 * Requirements: 3.3 - Return cached data on timeout
 * 
 * Design Decision: Multi-tier fallback strategy
 * Rationale: Ensures system availability during database outages
 */

const { getRedisClient, isRedisConnected } = require('../config/redis');
const { withTimeout, isConnectedToDatabase } = require('../config/database');
const { withRetry } = require('./databaseRetryService');

// Cache key prefixes
const CACHE_PREFIX = 'db:cache:';
const WRITE_QUEUE_PREFIX = 'db:writequeue:';

// Default TTLs
const DEFAULT_CACHE_TTL = 300; // 5 minutes
const WRITE_QUEUE_TTL = 86400; // 24 hours for queued writes

// Write queue for retry
let writeQueue = [];
let writeQueueProcessing = false;
let writeQueueTimer = null;
const WRITE_QUEUE_PROCESS_INTERVAL = 30000; // 30 seconds

/**
 * Generate cache key for a query
 * @param {string} collection - Collection name
 * @param {string} operation - Operation type
 * @param {Object} params - Query parameters
 * @returns {string} Cache key
 */
const generateCacheKey = (collection, operation, params) => {
  const paramHash = JSON.stringify(params);
  return `${CACHE_PREFIX}${collection}:${operation}:${Buffer.from(paramHash).toString('base64').slice(0, 32)}`;
};

/**
 * Store data in cache
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} ttl - TTL in seconds
 * @returns {Promise<boolean>} Success status
 */
const cacheData = async (key, data, ttl = DEFAULT_CACHE_TTL) => {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.setex(key, ttl, JSON.stringify({
      data,
      cachedAt: Date.now()
    }));
    return true;
  } catch (error) {
    console.error('Error caching data:', error.message);
    return false;
  }
};


/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {Promise<Object|null>} Cached data or null
 */
const getCachedData = async (key) => {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const cached = await client.get(key);
    if (!cached) return null;

    const { data, cachedAt } = JSON.parse(cached);
    return {
      data,
      cachedAt,
      age: Date.now() - cachedAt
    };
  } catch (error) {
    console.error('Error getting cached data:', error.message);
    return null;
  }
};

/**
 * Invalidate cache for a key or pattern
 * @param {string} keyOrPattern - Cache key or pattern
 * @returns {Promise<number>} Number of keys deleted
 */
const invalidateCache = async (keyOrPattern) => {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    if (keyOrPattern.includes('*')) {
      const keys = await client.keys(keyOrPattern);
      if (keys.length > 0) {
        return await client.del(...keys);
      }
      return 0;
    }
    return await client.del(keyOrPattern);
  } catch (error) {
    console.error('Error invalidating cache:', error.message);
    return 0;
  }
};

/**
 * Execute a read operation with cache fallback
 * Requirements: 3.5 - Serve cached data when DB unavailable
 * 
 * @param {Object} options - Operation options
 * @param {Function} options.dbOperation - Database operation function
 * @param {string} options.cacheKey - Cache key for this operation
 * @param {number} options.cacheTTL - Cache TTL in seconds
 * @param {number} options.timeoutMs - Query timeout in milliseconds
 * @param {string} options.operationName - Name for logging
 * @returns {Promise<Object>} Result with data and metadata
 */
const readWithFallback = async (options) => {
  const {
    dbOperation,
    cacheKey,
    cacheTTL = DEFAULT_CACHE_TTL,
    timeoutMs = 5000,
    operationName = 'read operation'
  } = options;

  // Check if database is connected
  const dbConnected = isConnectedToDatabase();

  // If DB is not connected, try cache first
  if (!dbConnected) {
    const cached = await getCachedData(cacheKey);
    if (cached) {
      console.log(`DB unavailable, serving ${operationName} from cache`);
      return {
        data: cached.data,
        fromCache: true,
        dbUnavailable: true,
        cacheAge: cached.age
      };
    }
    return {
      data: null,
      fromCache: false,
      dbUnavailable: true,
      error: 'Database unavailable and no cached data'
    };
  }

  // Try database with timeout
  const result = await withTimeout(
    dbOperation(),
    {
      timeoutMs,
      getCachedData: () => getCachedData(cacheKey).then(c => c?.data),
      operationName
    }
  );

  // If we got data from DB, cache it
  if (result.data && !result.fromCache) {
    await cacheData(cacheKey, result.data, cacheTTL);
  }

  return result;
};


/**
 * Queue a write operation for retry
 * Requirements: 3.5 - Queue writes for retry when DB unavailable
 * 
 * @param {Object} writeOp - Write operation details
 * @param {string} writeOp.collection - Collection name
 * @param {string} writeOp.operation - Operation type (create, update, delete)
 * @param {Object} writeOp.data - Operation data
 * @param {Object} writeOp.query - Query for update/delete operations
 * @returns {Object} Queue status
 */
const queueWrite = (writeOp) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...writeOp,
    queuedAt: Date.now(),
    attempts: 0
  };

  writeQueue.push(entry);

  // Also persist to Redis for durability
  persistWriteQueue();

  return {
    queued: true,
    id: entry.id,
    queueSize: writeQueue.length
  };
};

/**
 * Persist write queue to Redis
 */
const persistWriteQueue = async () => {
  const client = getRedisClient();
  if (!client || writeQueue.length === 0) return;

  try {
    await client.setex(
      `${WRITE_QUEUE_PREFIX}pending`,
      WRITE_QUEUE_TTL,
      JSON.stringify(writeQueue)
    );
  } catch (error) {
    console.error('Error persisting write queue:', error.message);
  }
};

/**
 * Load write queue from Redis
 */
const loadWriteQueue = async () => {
  const client = getRedisClient();
  if (!client) return;

  try {
    const stored = await client.get(`${WRITE_QUEUE_PREFIX}pending`);
    if (stored) {
      const loaded = JSON.parse(stored);
      // Merge with in-memory queue, avoiding duplicates
      const existingIds = new Set(writeQueue.map(w => w.id));
      for (const entry of loaded) {
        if (!existingIds.has(entry.id)) {
          writeQueue.push(entry);
        }
      }
    }
  } catch (error) {
    console.error('Error loading write queue:', error.message);
  }
};

/**
 * Process queued writes
 * Requirements: 3.5 - Retry queued writes when DB becomes available
 * 
 * @param {Function} executeWrite - Function to execute write operations
 * @returns {Promise<Object>} Processing result
 */
const processWriteQueue = async (executeWrite) => {
  if (writeQueueProcessing || writeQueue.length === 0) {
    return { processed: 0, remaining: writeQueue.length };
  }

  if (!isConnectedToDatabase()) {
    return { processed: 0, remaining: writeQueue.length, dbUnavailable: true };
  }

  writeQueueProcessing = true;
  let processed = 0;
  let failed = 0;
  const toRetry = [];

  try {
    while (writeQueue.length > 0) {
      const entry = writeQueue.shift();
      entry.attempts++;

      try {
        await withRetry(
          () => executeWrite(entry),
          { maxRetries: 2, operationName: `queued ${entry.operation}` }
        );
        processed++;
      } catch (error) {
        console.error(`Failed to process queued write ${entry.id}:`, error.message);
        
        // Re-queue if under max attempts
        if (entry.attempts < 5) {
          toRetry.push(entry);
        } else {
          failed++;
          console.error(`Dropping write ${entry.id} after ${entry.attempts} attempts`);
        }
      }
    }

    // Add failed entries back to queue
    writeQueue.push(...toRetry);
    await persistWriteQueue();

    return {
      processed,
      failed,
      remaining: writeQueue.length
    };
  } finally {
    writeQueueProcessing = false;
  }
};


/**
 * Execute a write operation with fallback to queue
 * Requirements: 3.5 - Queue writes for retry when DB unavailable
 * 
 * @param {Object} options - Operation options
 * @param {Function} options.dbOperation - Database operation function
 * @param {Object} options.writeDetails - Details for queueing if needed
 * @param {string} options.cacheKeyToInvalidate - Cache key to invalidate on success
 * @param {number} options.timeoutMs - Query timeout in milliseconds
 * @param {string} options.operationName - Name for logging
 * @returns {Promise<Object>} Result with data and metadata
 */
const writeWithFallback = async (options) => {
  const {
    dbOperation,
    writeDetails,
    cacheKeyToInvalidate,
    timeoutMs = 5000,
    operationName = 'write operation'
  } = options;

  // Check if database is connected
  if (!isConnectedToDatabase()) {
    if (writeDetails) {
      const queueResult = queueWrite(writeDetails);
      return {
        data: null,
        queued: true,
        queueId: queueResult.id,
        dbUnavailable: true
      };
    }
    return {
      data: null,
      queued: false,
      dbUnavailable: true,
      error: 'Database unavailable'
    };
  }

  try {
    const result = await withTimeout(
      dbOperation(),
      { timeoutMs, operationName }
    );

    if (result.timedOut && writeDetails) {
      // Queue the write for retry
      const queueResult = queueWrite(writeDetails);
      return {
        data: null,
        queued: true,
        queueId: queueResult.id,
        timedOut: true
      };
    }

    // Invalidate cache on successful write
    if (result.data && cacheKeyToInvalidate) {
      await invalidateCache(cacheKeyToInvalidate);
    }

    return result;
  } catch (error) {
    // Queue write on error if details provided
    if (writeDetails) {
      const queueResult = queueWrite(writeDetails);
      return {
        data: null,
        queued: true,
        queueId: queueResult.id,
        error: error.message
      };
    }
    throw error;
  }
};

/**
 * Start the write queue processor
 * @param {Function} executeWrite - Function to execute write operations
 */
const startWriteQueueProcessor = (executeWrite) => {
  // Load any persisted queue entries
  loadWriteQueue();

  if (writeQueueTimer) {
    clearInterval(writeQueueTimer);
  }

  writeQueueTimer = setInterval(async () => {
    const result = await processWriteQueue(executeWrite);
    if (result.processed > 0) {
      console.log(`Write queue processed: ${result.processed} writes, ${result.remaining} remaining`);
    }
  }, WRITE_QUEUE_PROCESS_INTERVAL);

  console.log(`Write queue processor started (interval: ${WRITE_QUEUE_PROCESS_INTERVAL}ms)`);
};

/**
 * Stop the write queue processor
 */
const stopWriteQueueProcessor = async () => {
  if (writeQueueTimer) {
    clearInterval(writeQueueTimer);
    writeQueueTimer = null;
  }
  await persistWriteQueue();
  console.log('Write queue processor stopped');
};

/**
 * Get write queue status
 * @returns {Object} Queue status
 */
const getWriteQueueStatus = () => {
  return {
    size: writeQueue.length,
    processing: writeQueueProcessing,
    oldestEntry: writeQueue.length > 0 ? writeQueue[0].queuedAt : null,
    entries: writeQueue.map(e => ({
      id: e.id,
      collection: e.collection,
      operation: e.operation,
      attempts: e.attempts,
      queuedAt: e.queuedAt
    }))
  };
};

/**
 * Clear the write queue (use with caution)
 * @returns {number} Number of entries cleared
 */
const clearWriteQueue = async () => {
  const count = writeQueue.length;
  writeQueue = [];
  
  const client = getRedisClient();
  if (client) {
    await client.del(`${WRITE_QUEUE_PREFIX}pending`);
  }
  
  return count;
};

module.exports = {
  // Cache operations
  generateCacheKey,
  cacheData,
  getCachedData,
  invalidateCache,
  
  // Read with fallback
  readWithFallback,
  
  // Write with fallback
  writeWithFallback,
  queueWrite,
  processWriteQueue,
  
  // Queue management
  startWriteQueueProcessor,
  stopWriteQueueProcessor,
  getWriteQueueStatus,
  clearWriteQueue,
  loadWriteQueue,
  
  // Constants
  DEFAULT_CACHE_TTL,
  WRITE_QUEUE_TTL
};
