const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const DEFAULT_QUERY_TIMEOUT_MS = 5000; // 5-second default timeout (Requirements: 3.3)

let isConnected = false;
let connectionRetries = 0;
let mongoServer = null; // For in-memory MongoDB

/**
 * Connect to MongoDB with retry logic
 * Design Decision: Connection pooling and retry logic for resilience
 * Rationale: Ensures database availability during transient failures
 * 
 * In development mode with USE_MEMORY_DB=true, uses mongodb-memory-server
 */
const connectDatabase = async () => {
  if (isConnected) {
    console.log('Using existing database connection');
    return;
  }

  let mongoUri = process.env.MONGODB_URI;
  
  // Use in-memory MongoDB for development if configured or if connection fails
  const useMemoryDb = process.env.USE_MEMORY_DB === 'true' || process.env.NODE_ENV === 'development';
  
  if (!mongoUri && !useMemoryDb) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const options = {
    // Connection pool settings (Requirements: 3.1, 3.2)
    // Design Decision: 100 max connections to serve 10K concurrent users efficiently
    maxPoolSize: 100,           // Max connections per server
    minPoolSize: 10,            // Keep minimum connections ready for quick response
    maxIdleTimeMS: 30000,       // Close idle connections after 30s to free resources
    waitQueueTimeoutMS: 10000,  // Wait 10s for connection before error (Requirements: 3.2)
    
    // Read preference for load distribution (Requirements: 3.4)
    readPreference: 'secondaryPreferred', // Use replicas for reads
    
    // Retry settings for resilience
    retryWrites: true,
    retryReads: true,
    
    // Timeouts
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  };

  while (connectionRetries < MAX_RETRIES) {
    try {
      await mongoose.connect(mongoUri, options);
      isConnected = true;
      connectionRetries = 0;
      
      // Set up connection event handlers
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err.message);
        isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
        isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
        isConnected = true;
      });

      return;
    } catch (error) {
      connectionRetries++;
      console.error(
        `MongoDB connection attempt ${connectionRetries}/${MAX_RETRIES} failed:`,
        error.message
      );

      // In development, try to use in-memory MongoDB as fallback
      if (useMemoryDb && connectionRetries === 1) {
        try {
          console.log('Attempting to use in-memory MongoDB...');
          const { MongoMemoryServer } = require('mongodb-memory-server');
          mongoServer = await MongoMemoryServer.create();
          mongoUri = mongoServer.getUri();
          console.log('✓ In-memory MongoDB started');
          connectionRetries = 0; // Reset retries for memory server
          continue;
        } catch (memError) {
          console.warn('Could not start in-memory MongoDB:', memError.message);
        }
      }

      if (connectionRetries >= MAX_RETRIES) {
        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

/**
 * Disconnect from MongoDB
 */
const disconnectDatabase = async () => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error.message);
    throw error;
  }
};

/**
 * Check database connection health
 * @returns {Object} Health status object
 */
const checkDatabaseHealth = async () => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return {
        status: 'unhealthy',
        message: 'Database not connected',
        readyState: mongoose.connection.readyState
      };
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();
    
    return {
      status: 'healthy',
      message: 'Database connection is active',
      readyState: mongoose.connection.readyState
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      readyState: mongoose.connection.readyState
    };
  }
};

/**
 * Get connection status
 * @returns {boolean} Connection status
 */
const isConnectedToDatabase = () => isConnected;

/**
 * Execute a query with timeout
 * Requirements: 3.3 - Database query timeout with cached data fallback
 * 
 * @param {Promise} query - The database query promise
 * @param {Object} options - Options for timeout behavior
 * @param {number} options.timeoutMs - Timeout in milliseconds (default: 5000)
 * @param {Function} options.getCachedData - Optional function to get cached data on timeout
 * @param {string} options.operationName - Name for logging purposes
 * @returns {Promise<Object>} Query result or cached data
 */
const withTimeout = async (query, options = {}) => {
  const {
    timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
    getCachedData = null,
    operationName = 'database query'
  } = options;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timeout: ${operationName} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([query, timeoutPromise]);
    return {
      data: result,
      fromCache: false,
      timedOut: false
    };
  } catch (error) {
    if (error.message.startsWith('Query timeout:')) {
      console.warn(`${operationName} timed out after ${timeoutMs}ms`);
      
      // Try to serve from cache if available
      if (getCachedData) {
        try {
          const cachedData = await getCachedData();
          if (cachedData) {
            console.log(`Serving ${operationName} from cache after timeout`);
            return {
              data: cachedData,
              fromCache: true,
              timedOut: true
            };
          }
        } catch (cacheError) {
          console.error(`Failed to get cached data for ${operationName}:`, cacheError.message);
        }
      }
      
      // Return null result if no cache available
      return {
        data: null,
        fromCache: false,
        timedOut: true,
        error: error.message
      };
    }
    
    // Re-throw non-timeout errors
    throw error;
  }
};

/**
 * Get connection pool statistics
 * @returns {Object} Pool statistics
 */
const getConnectionPoolStats = () => {
  if (!isConnected || !mongoose.connection.client) {
    return {
      connected: false,
      poolSize: 0,
      availableConnections: 0,
      waitQueueSize: 0
    };
  }

  try {
    const topology = mongoose.connection.client.topology;
    if (topology && topology.s && topology.s.pool) {
      const pool = topology.s.pool;
      return {
        connected: true,
        poolSize: pool.totalConnectionCount || 0,
        availableConnections: pool.availableConnectionCount || 0,
        waitQueueSize: pool.waitQueueSize || 0,
        maxPoolSize: 100,
        minPoolSize: 10
      };
    }
  } catch (error) {
    console.error('Error getting pool stats:', error.message);
  }

  return {
    connected: isConnected,
    poolSize: 'unknown',
    availableConnections: 'unknown',
    waitQueueSize: 'unknown',
    maxPoolSize: 100,
    minPoolSize: 10
  };
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
  isConnectedToDatabase,
  withTimeout,
  getConnectionPoolStats,
  DEFAULT_QUERY_TIMEOUT_MS
};
