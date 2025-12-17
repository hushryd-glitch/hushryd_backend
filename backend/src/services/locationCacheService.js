/**
 * Location Cache Service
 * Handles Redis-based caching for real-time driver locations
 * Requirements: 6.3 - Store driver location in Redis for real-time access without database writes
 * Requirements: 2.5 - Batch location updates and sync when connection stabilizes
 * 
 * Design Decision: Replace MongoDB writes with Redis for real-time locations
 * Rationale: Redis provides sub-millisecond latency for location reads/writes,
 * reducing database load and enabling 3K+ concurrent tracking sessions
 */

const { getRedisClient, isRedisConnected } = require('../config/redis');

// TTL for location data in Redis (5 minutes as per Requirements 6.3)
const LOCATION_TTL_SECONDS = 300;

// Key prefixes for Redis storage
const DRIVER_LOCATION_KEY = 'location:driver:';
const TRIP_LOCATION_KEY = 'location:trip:';
const LOCATION_HISTORY_KEY = 'location:history:';
const LOCATION_BUFFER_KEY = 'location:buffer:';

// Buffer settings for MongoDB batch writes (Requirements 2.5)
const BUFFER_MAX_SIZE = 100;
const BUFFER_FLUSH_INTERVAL_MS = 30000; // 30 seconds

// Location buffer for batch MongoDB writes
let locationBuffer = [];
let bufferFlushTimer = null;
let mongoFlushCallback = null;

/**
 * Store driver location in Redis
 * Requirements: 6.3 - Store in Redis for real-time access without database writes
 * 
 * @param {string} driverId - Driver ID
 * @param {Object} locationData - Location data
 * @param {Object} locationData.coordinates - GPS coordinates {lat, lng}
 * @param {number} locationData.speed - Current speed in km/h
 * @param {number} locationData.heading - Heading in degrees
 * @param {string} locationData.tripId - Associated trip ID (optional)
 * @returns {Promise<Object>} Storage result
 */
const storeDriverLocation = async (driverId, locationData) => {
  const client = getRedisClient();
  
  if (!client) {
    return {
      success: false,
      error: 'Redis not connected',
      fallback: true
    };
  }

  try {
    const { coordinates, speed, heading, tripId, timestamp } = locationData;
    
    const payload = {
      driverId,
      tripId: tripId || null,
      lat: coordinates.lat,
      lng: coordinates.lng,
      speed: speed || 0,
      heading: heading || 0,
      timestamp: timestamp || Date.now(),
      storedAt: Date.now()
    };

    const key = `${DRIVER_LOCATION_KEY}${driverId}`;
    
    // Store with 5-minute TTL for auto-expiry (Requirements 6.3)
    await client.setex(key, LOCATION_TTL_SECONDS, JSON.stringify(payload));

    // Also store by trip ID if provided for quick trip-based lookups
    if (tripId) {
      const tripKey = `${TRIP_LOCATION_KEY}${tripId}`;
      await client.setex(tripKey, LOCATION_TTL_SECONDS, JSON.stringify(payload));
    }

    return {
      success: true,
      driverId,
      tripId,
      ttl: LOCATION_TTL_SECONDS,
      timestamp: payload.timestamp
    };
  } catch (error) {
    console.error('Error storing driver location in Redis:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
};

/**
 * Get driver location from Redis cache
 * Requirements: 6.3 - Real-time access without database reads
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object|null>} Location data or null
 */
const getDriverLocation = async (driverId) => {
  const client = getRedisClient();
  
  if (!client) {
    return null;
  }

  try {
    const key = `${DRIVER_LOCATION_KEY}${driverId}`;
    const data = await client.get(key);
    
    if (!data) {
      return null;
    }

    const location = JSON.parse(data);
    
    // Check if location is stale (older than TTL)
    const age = Date.now() - location.storedAt;
    if (age > LOCATION_TTL_SECONDS * 1000) {
      return null;
    }

    return {
      ...location,
      age,
      isStale: age > 60000 // Consider stale if older than 1 minute
    };
  } catch (error) {
    console.error('Error getting driver location from Redis:', error.message);
    return null;
  }
};

/**
 * Get trip location from Redis cache
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object|null>} Location data or null
 */
const getTripLocation = async (tripId) => {
  const client = getRedisClient();
  
  if (!client) {
    return null;
  }

  try {
    const key = `${TRIP_LOCATION_KEY}${tripId}`;
    const data = await client.get(key);
    
    if (!data) {
      return null;
    }

    const location = JSON.parse(data);
    const age = Date.now() - location.storedAt;

    return {
      ...location,
      age,
      isStale: age > 60000
    };
  } catch (error) {
    console.error('Error getting trip location from Redis:', error.message);
    return null;
  }
};

/**
 * Get multiple driver locations at once
 * @param {Array<string>} driverIds - Array of driver IDs
 * @returns {Promise<Object>} Map of driverId -> location
 */
const getMultipleDriverLocations = async (driverIds) => {
  const client = getRedisClient();
  
  if (!client || !driverIds || driverIds.length === 0) {
    return {};
  }

  try {
    const keys = driverIds.map(id => `${DRIVER_LOCATION_KEY}${id}`);
    const results = await client.mget(keys);
    
    const locations = {};
    results.forEach((data, index) => {
      if (data) {
        try {
          const location = JSON.parse(data);
          const age = Date.now() - location.storedAt;
          
          if (age <= LOCATION_TTL_SECONDS * 1000) {
            locations[driverIds[index]] = {
              ...location,
              age,
              isStale: age > 60000
            };
          }
        } catch (e) {
          // Skip invalid data
        }
      }
    });

    return locations;
  } catch (error) {
    console.error('Error getting multiple driver locations:', error.message);
    return {};
  }
};

/**
 * Clear driver location from cache
 * @param {string} driverId - Driver ID
 * @param {string} tripId - Trip ID (optional)
 * @returns {Promise<boolean>} Whether deletion was successful
 */
const clearDriverLocation = async (driverId, tripId = null) => {
  const client = getRedisClient();
  
  if (!client) {
    return false;
  }

  try {
    const keys = [`${DRIVER_LOCATION_KEY}${driverId}`];
    
    if (tripId) {
      keys.push(`${TRIP_LOCATION_KEY}${tripId}`);
    }

    await client.del(...keys);
    return true;
  } catch (error) {
    console.error('Error clearing driver location:', error.message);
    return false;
  }
};

/**
 * Get remaining TTL for a driver's location
 * @param {string} driverId - Driver ID
 * @returns {Promise<number>} TTL in seconds, -1 if no TTL, -2 if key doesn't exist
 */
const getLocationTTL = async (driverId) => {
  const client = getRedisClient();
  
  if (!client) {
    return -2;
  }

  try {
    const key = `${DRIVER_LOCATION_KEY}${driverId}`;
    return await client.ttl(key);
  } catch (error) {
    console.error('Error getting location TTL:', error.message);
    return -2;
  }
};

// ============================================
// Location Buffering for MongoDB Batch Writes
// Requirements: 2.5 - Batch location updates
// ============================================

/**
 * Add location to buffer for batch MongoDB write
 * Requirements: 2.5 - Buffer location updates, batch write every 30 seconds
 * 
 * @param {Object} locationData - Location data to buffer
 * @returns {Object} Buffer status
 */
const bufferLocationForMongo = (locationData) => {
  const entry = {
    ...locationData,
    bufferedAt: Date.now()
  };

  locationBuffer.push(entry);

  // Check if buffer should be flushed
  if (locationBuffer.length >= BUFFER_MAX_SIZE) {
    flushLocationBuffer();
  }

  return {
    buffered: true,
    bufferSize: locationBuffer.length,
    willFlushAt: bufferFlushTimer ? 'scheduled' : 'on-demand'
  };
};

/**
 * Flush location buffer to MongoDB
 * Requirements: 2.5 - Batch write to MongoDB every 30 seconds for history
 * 
 * @returns {Promise<Object>} Flush result
 */
const flushLocationBuffer = async () => {
  if (locationBuffer.length === 0) {
    return { flushed: 0, success: true };
  }

  const toFlush = [...locationBuffer];
  locationBuffer = [];

  try {
    if (mongoFlushCallback) {
      await mongoFlushCallback(toFlush);
    }

    return {
      flushed: toFlush.length,
      success: true,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error flushing location buffer to MongoDB:', error.message);
    
    // Re-add failed entries to buffer (up to max size)
    const reAdd = toFlush.slice(0, BUFFER_MAX_SIZE - locationBuffer.length);
    locationBuffer = [...reAdd, ...locationBuffer];

    return {
      flushed: 0,
      success: false,
      error: error.message,
      requeued: reAdd.length
    };
  }
};

/**
 * Start the buffer flush timer
 * Requirements: 2.5 - Batch write every 30 seconds
 * 
 * @param {Function} callback - Callback to write locations to MongoDB
 */
const startBufferFlushTimer = (callback) => {
  mongoFlushCallback = callback;

  if (bufferFlushTimer) {
    clearInterval(bufferFlushTimer);
  }

  bufferFlushTimer = setInterval(async () => {
    const result = await flushLocationBuffer();
    if (result.flushed > 0) {
      console.log(`Location buffer flushed: ${result.flushed} entries written to MongoDB`);
    }
  }, BUFFER_FLUSH_INTERVAL_MS);

  console.log(`Location buffer flush timer started (interval: ${BUFFER_FLUSH_INTERVAL_MS}ms)`);
};

/**
 * Stop the buffer flush timer
 */
const stopBufferFlushTimer = async () => {
  if (bufferFlushTimer) {
    clearInterval(bufferFlushTimer);
    bufferFlushTimer = null;
  }

  // Flush any remaining entries
  if (locationBuffer.length > 0) {
    await flushLocationBuffer();
  }

  mongoFlushCallback = null;
  console.log('Location buffer flush timer stopped');
};

/**
 * Get buffer status
 * @returns {Object} Buffer statistics
 */
const getBufferStatus = () => {
  return {
    size: locationBuffer.length,
    maxSize: BUFFER_MAX_SIZE,
    flushIntervalMs: BUFFER_FLUSH_INTERVAL_MS,
    timerActive: bufferFlushTimer !== null,
    oldestEntry: locationBuffer.length > 0 ? locationBuffer[0].bufferedAt : null
  };
};

// ============================================
// Location Cache Statistics
// ============================================

/**
 * Get location cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
const getCacheStats = async () => {
  const client = getRedisClient();
  
  if (!client) {
    return {
      connected: false,
      driverLocations: 0,
      tripLocations: 0
    };
  }

  try {
    // Count driver location keys
    const driverKeys = await client.keys(`${DRIVER_LOCATION_KEY}*`);
    const tripKeys = await client.keys(`${TRIP_LOCATION_KEY}*`);

    return {
      connected: true,
      driverLocations: driverKeys.length,
      tripLocations: tripKeys.length,
      ttlSeconds: LOCATION_TTL_SECONDS,
      bufferStatus: getBufferStatus()
    };
  } catch (error) {
    console.error('Error getting cache stats:', error.message);
    return {
      connected: isRedisConnected(),
      error: error.message
    };
  }
};

module.exports = {
  // Core location caching
  storeDriverLocation,
  getDriverLocation,
  getTripLocation,
  getMultipleDriverLocations,
  clearDriverLocation,
  getLocationTTL,
  
  // Buffer management for MongoDB batch writes
  bufferLocationForMongo,
  flushLocationBuffer,
  startBufferFlushTimer,
  stopBufferFlushTimer,
  getBufferStatus,
  
  // Statistics
  getCacheStats,
  
  // Constants
  LOCATION_TTL_SECONDS,
  BUFFER_MAX_SIZE,
  BUFFER_FLUSH_INTERVAL_MS
};
