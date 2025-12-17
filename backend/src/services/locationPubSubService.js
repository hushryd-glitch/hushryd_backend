/**
 * Location Pub/Sub Service
 * Handles Redis pub/sub for real-time location updates
 * Requirements: 2.1, 2.2 - Broadcast location updates within 500ms using Redis pub/sub
 * 
 * Design Decision: Dedicated Redis pub/sub for location broadcasting
 * Rationale: Decouples location updates from WebSocket servers, enabling horizontal scaling
 */

const Redis = require('ioredis');
const { getRedisClient, isRedisConnected } = require('../config/redis');

// Redis pub/sub clients for location updates
let locationPubClient = null;
let locationSubClient = null;
let isInitialized = false;

// Callback for handling received location updates
let locationUpdateCallback = null;

// Channel patterns
const TRIP_LOCATION_CHANNEL_PREFIX = 'trip:location:';
const DRIVER_LOCATION_KEY_PREFIX = 'location:driver:';
const TRIP_LOCATION_KEY_PREFIX = 'location:trip:';

// TTL for location data in Redis (5 minutes)
const LOCATION_TTL_SECONDS = 300;

/**
 * Initialize location pub/sub service
 * Requirements: 2.2 - Redis pub/sub for location broadcasting
 * 
 * @param {Function} onLocationUpdate - Callback when location update is received
 * @returns {Promise<boolean>} Whether initialization was successful
 */
const initializeLocationPubSub = async (onLocationUpdate) => {
  if (isInitialized) {
    console.log('Location pub/sub already initialized');
    return true;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Create dedicated pub/sub clients for location updates
    locationPubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 5) return null;
        return Math.min(times * 1000, 5000);
      }
    });

    locationSubClient = locationPubClient.duplicate();

    // Wait for both clients to be ready
    await Promise.all([
      new Promise((resolve, reject) => {
        locationPubClient.once('ready', resolve);
        locationPubClient.once('error', reject);
        setTimeout(() => reject(new Error('Location pub client timeout')), 10000);
      }),
      new Promise((resolve, reject) => {
        locationSubClient.once('ready', resolve);
        locationSubClient.once('error', reject);
        setTimeout(() => reject(new Error('Location sub client timeout')), 10000);
      })
    ]);

    // Store callback for location updates
    locationUpdateCallback = onLocationUpdate;

    // Subscribe to location update pattern
    await locationSubClient.psubscribe(`${TRIP_LOCATION_CHANNEL_PREFIX}*`);

    // Handle incoming location messages
    locationSubClient.on('pmessage', (pattern, channel, message) => {
      try {
        const tripId = channel.replace(TRIP_LOCATION_CHANNEL_PREFIX, '');
        const locationData = JSON.parse(message);
        
        if (locationUpdateCallback) {
          locationUpdateCallback(tripId, locationData);
        }
      } catch (error) {
        console.error('Error processing location message:', error.message);
      }
    });

    // Handle errors
    locationPubClient.on('error', (err) => {
      console.error('Location pub client error:', err.message);
    });

    locationSubClient.on('error', (err) => {
      console.error('Location sub client error:', err.message);
    });

    isInitialized = true;
    console.log('✓ Location pub/sub service initialized');
    return true;
  } catch (error) {
    console.warn('Location pub/sub initialization failed:', error.message);
    isInitialized = false;
    return false;
  }
};

/**
 * Publish driver location update
 * Requirements: 2.2 - Broadcast to all relevant passengers within 500ms
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} locationData - Location data
 * @returns {Promise<Object>} Publish result
 */
const publishLocationUpdate = async (tripId, locationData) => {
  const startTime = Date.now();
  
  if (!locationPubClient || !isInitialized) {
    return {
      success: false,
      error: 'Location pub/sub not initialized',
      fallback: true
    };
  }

  try {
    const { driverId, coordinates, speed, heading, timestamp } = locationData;
    
    const payload = {
      tripId,
      driverId,
      lat: coordinates.lat,
      lng: coordinates.lng,
      speed: speed || 0,
      heading: heading || 0,
      timestamp: timestamp || Date.now()
    };

    // Store in Redis for real-time access (Requirements: 6.3)
    // Driver location with 5-minute TTL
    await locationPubClient.setex(
      `${DRIVER_LOCATION_KEY_PREFIX}${driverId}`,
      LOCATION_TTL_SECONDS,
      JSON.stringify(payload)
    );

    // Trip location for quick lookup
    await locationPubClient.setex(
      `${TRIP_LOCATION_KEY_PREFIX}${tripId}`,
      LOCATION_TTL_SECONDS,
      JSON.stringify(payload)
    );

    // Publish to trip channel for all subscribers
    await locationPubClient.publish(
      `${TRIP_LOCATION_CHANNEL_PREFIX}${tripId}`,
      JSON.stringify(payload)
    );

    const latency = Date.now() - startTime;
    
    // Log warning if latency exceeds 500ms (Requirements: 2.2)
    if (latency > 500) {
      console.warn(`Location publish latency exceeded 500ms: ${latency}ms for trip ${tripId}`);
    }

    return {
      success: true,
      tripId,
      latency,
      timestamp: payload.timestamp
    };
  } catch (error) {
    console.error('Error publishing location update:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
};

/**
 * Get driver location from Redis cache
 * Requirements: 6.3 - Store driver location in Redis for real-time access
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object|null>} Location data or null
 */
const getDriverLocationFromCache = async (driverId) => {
  try {
    const client = locationPubClient || getRedisClient();
    if (!client) return null;

    const data = await client.get(`${DRIVER_LOCATION_KEY_PREFIX}${driverId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting driver location from cache:', error.message);
    return null;
  }
};

/**
 * Get trip location from Redis cache
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object|null>} Location data or null
 */
const getTripLocationFromCache = async (tripId) => {
  try {
    const client = locationPubClient || getRedisClient();
    if (!client) return null;

    const data = await client.get(`${TRIP_LOCATION_KEY_PREFIX}${tripId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting trip location from cache:', error.message);
    return null;
  }
};

/**
 * Subscribe to location updates for a specific trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>} Whether subscription was successful
 */
const subscribeToTripLocation = async (tripId) => {
  if (!locationSubClient || !isInitialized) {
    return false;
  }

  try {
    // Pattern subscription already handles all trips
    // This is for explicit tracking
    return true;
  } catch (error) {
    console.error('Error subscribing to trip location:', error.message);
    return false;
  }
};

/**
 * Clear location data for a trip (when trip ends)
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID
 * @returns {Promise<boolean>} Whether cleanup was successful
 */
const clearTripLocationData = async (tripId, driverId) => {
  try {
    const client = locationPubClient || getRedisClient();
    if (!client) return false;

    await client.del(`${TRIP_LOCATION_KEY_PREFIX}${tripId}`);
    if (driverId) {
      await client.del(`${DRIVER_LOCATION_KEY_PREFIX}${driverId}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing trip location data:', error.message);
    return false;
  }
};

/**
 * Get pub/sub service status
 * @returns {Object} Service status
 */
const getLocationPubSubStatus = () => {
  return {
    initialized: isInitialized,
    pubClientConnected: locationPubClient ? locationPubClient.status === 'ready' : false,
    subClientConnected: locationSubClient ? locationSubClient.status === 'ready' : false
  };
};

/**
 * Cleanup location pub/sub connections
 * @returns {Promise<void>}
 */
const cleanupLocationPubSub = async () => {
  try {
    if (locationSubClient) {
      await locationSubClient.punsubscribe();
      await locationSubClient.quit();
      locationSubClient = null;
    }
    if (locationPubClient) {
      await locationPubClient.quit();
      locationPubClient = null;
    }
    isInitialized = false;
    locationUpdateCallback = null;
    console.log('Location pub/sub connections closed');
  } catch (error) {
    console.error('Error cleaning up location pub/sub:', error.message);
  }
};

/**
 * Check if location pub/sub is initialized
 * @returns {boolean}
 */
const isLocationPubSubInitialized = () => isInitialized;

module.exports = {
  initializeLocationPubSub,
  publishLocationUpdate,
  getDriverLocationFromCache,
  getTripLocationFromCache,
  subscribeToTripLocation,
  clearTripLocationData,
  getLocationPubSubStatus,
  cleanupLocationPubSub,
  isLocationPubSubInitialized,
  LOCATION_TTL_SECONDS
};
