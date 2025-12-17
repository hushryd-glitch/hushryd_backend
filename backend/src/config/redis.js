/**
 * Redis Configuration Module
 * Design Decision: Connection pooling with automatic reconnection for high availability
 * Rationale: Supports 10K+ concurrent users with efficient connection reuse
 * 
 * Requirements: 6.1, 6.2, 6.3 - Caching strategy for user profiles, trip search, and driver locations
 */

const Redis = require('ioredis');

// Redis connection state
let redisClient = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3000;

/**
 * Get Redis configuration from environment
 * @returns {Object} Redis configuration options
 */
const getRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  return {
    // Connection settings
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    
    // Connection pool settings (ioredis handles pooling internally)
    // For explicit pooling, use lazyConnect with multiple clients
    lazyConnect: false,
    
    // Reconnection settings
    retryStrategy: (times) => {
      if (times > MAX_RECONNECT_ATTEMPTS) {
        console.error(`Redis: Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`);
        return null; // Stop retrying
      }
      const delay = Math.min(times * RECONNECT_DELAY_MS, 30000);
      console.log(`Redis: Reconnecting in ${delay}ms (attempt ${times}/${MAX_RECONNECT_ATTEMPTS})`);
      return delay;
    },
    
    // Timeouts
    connectTimeout: 10000,
    commandTimeout: 5000,
    
    // Keep-alive
    keepAlive: 30000,
    
    // Auto-reconnect on error
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some(e => err.message.includes(e));
    }
  };
};

/**
 * Create and connect Redis client
 * @returns {Promise<Redis>} Connected Redis client
 */
const connectRedis = async () => {
  if (redisClient && isConnected) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const config = getRedisConfig();

  return new Promise((resolve, reject) => {
    try {
      redisClient = new Redis(redisUrl, config);

      redisClient.on('connect', () => {
        console.log('Redis: Connecting...');
      });

      redisClient.on('ready', () => {
        isConnected = true;
        connectionAttempts = 0;
        console.log('✓ Redis connected and ready');
        resolve(redisClient);
      });

      redisClient.on('error', (err) => {
        console.error('Redis connection error:', err.message);
        isConnected = false;
      });

      redisClient.on('close', () => {
        console.warn('Redis: Connection closed');
        isConnected = false;
      });

      redisClient.on('reconnecting', (delay) => {
        connectionAttempts++;
        console.log(`Redis: Reconnecting (attempt ${connectionAttempts})...`);
      });

      redisClient.on('end', () => {
        console.log('Redis: Connection ended');
        isConnected = false;
        redisClient = null;
      });

      // Set a timeout for initial connection
      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          console.warn('Redis: Initial connection timeout, continuing without Redis');
          resolve(null);
        }
      }, 10000);

      redisClient.once('ready', () => {
        clearTimeout(connectionTimeout);
      });

    } catch (error) {
      console.error('Redis: Failed to create client:', error.message);
      reject(error);
    }
  });
};

/**
 * Get the Redis client instance
 * @returns {Redis|null} Redis client or null if not connected
 */
const getRedisClient = () => {
  if (!redisClient || !isConnected) {
    return null;
  }
  return redisClient;
};

/**
 * Disconnect from Redis
 * @returns {Promise<void>}
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      isConnected = false;
      redisClient = null;
      console.log('Redis: Disconnected');
    } catch (error) {
      console.error('Redis: Error during disconnect:', error.message);
      // Force disconnect
      redisClient.disconnect();
      isConnected = false;
      redisClient = null;
    }
  }
};

/**
 * Check Redis connection health
 * @returns {Promise<Object>} Health status object
 */
const checkRedisHealth = async () => {
  try {
    if (!redisClient || !isConnected) {
      return {
        status: 'unhealthy',
        message: 'Redis not connected',
        connected: false
      };
    }

    const startTime = Date.now();
    const pong = await redisClient.ping();
    const latency = Date.now() - startTime;

    if (pong === 'PONG') {
      return {
        status: 'healthy',
        message: 'Redis connection is active',
        connected: true,
        latency
      };
    }

    return {
      status: 'unhealthy',
      message: 'Redis ping failed',
      connected: false
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      connected: false
    };
  }
};

/**
 * Check if Redis is connected
 * @returns {boolean} Connection status
 */
const isRedisConnected = () => isConnected;

/**
 * Get Redis connection info
 * @returns {Object} Connection information
 */
const getConnectionInfo = () => {
  return {
    connected: isConnected,
    reconnectAttempts: connectionAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS
  };
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  checkRedisHealth,
  isRedisConnected,
  getConnectionInfo
};
