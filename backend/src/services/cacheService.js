/**
 * Cache Service
 * Multi-tier caching with Redis for high-load scalability
 * 
 * Design Decision: Multi-tier caching with Redis
 * Rationale: Reduces database load by 80%+ for read operations
 * 
 * Requirements: 6.1 - User profile cache with 5-min TTL
 * Requirements: 6.2 - Trip search cache with 30-sec TTL
 * Requirements: 6.3 - Driver location from Redis for real-time access
 * Requirements: 6.4 - Cache invalidation on data updates
 * Requirements: 6.5 - Fallback to database on cache miss or Redis failure
 */

const { getRedisClient, isRedisConnected } = require('../config/redis');
const User = require('../models/User');
const { getDriverLocation: getLocationFromCache } = require('./locationCacheService');

// Cache TTL constants (in seconds)
const USER_PROFILE_TTL = 300;      // 5 minutes - Requirements: 6.1
const TRIP_SEARCH_TTL = 30;        // 30 seconds - Requirements: 6.2
const TRIP_DETAILS_TTL = 60;       // 1 minute for individual trip details

// Cache key prefixes
const CACHE_KEYS = {
  USER_PROFILE: 'cache:user:profile:',
  TRIP_SEARCH: 'cache:trip:search:',
  TRIP_DETAILS: 'cache:trip:details:'
};

/**
 * Generate a cache key for trip search based on search parameters
 * @param {Object} searchParams - Search parameters
 * @returns {string} Cache key
 */
const generateSearchCacheKey = (searchParams) => {
  const {
    sourceCoords,
    destCoords,
    from,
    to,
    date,
    seats,
    vehicleType,
    maxFare,
    minRating,
    sortBy,
    sortOrder,
    page,
    limit,
    radiusKm,
    departureTime,
    amenities
  } = searchParams;

  // Create a normalized key from search parameters
  const keyParts = [
    sourceCoords ? `src:${sourceCoords.lat},${sourceCoords.lng}` : '',
    destCoords ? `dst:${destCoords.lat},${destCoords.lng}` : '',
    from ? `from:${from}` : '',
    to ? `to:${to}` : '',
    date ? `date:${date}` : '',
    seats ? `seats:${seats}` : '',
    vehicleType ? `vt:${vehicleType}` : '',
    maxFare ? `mf:${maxFare}` : '',
    minRating ? `mr:${minRating}` : '',
    sortBy ? `sb:${sortBy}` : '',
    sortOrder ? `so:${sortOrder}` : '',
    page ? `p:${page}` : '',
    limit ? `l:${limit}` : '',
    radiusKm ? `r:${radiusKm}` : '',
    departureTime ? `dt:${departureTime}` : '',
    amenities ? `am:${amenities}` : ''
  ].filter(Boolean).join(':');

  return `${CACHE_KEYS.TRIP_SEARCH}${keyParts}`;
};


/**
 * Get user profile with caching
 * Requirements: 6.1 - Serve from Redis cache with 5-minute TTL
 * Requirements: 6.5 - Fall back to database on cache miss or Redis failure
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile or null if not found
 */
const getUserProfile = async (userId) => {
  if (!userId) {
    return null;
  }

  const client = getRedisClient();
  const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;

  // Try cache first if Redis is available
  if (client) {
    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          _fromCache: true,
          _cacheKey: cacheKey
        };
      }
    } catch (error) {
      console.warn('Cache read error for user profile:', error.message);
      // Continue to database fallback
    }
  }

  // Cache miss or Redis unavailable - fetch from database
  // Requirements: 6.5 - Fall back to database
  try {
    const user = await User.findById(userId)
      .select('-password -__v')
      .lean();

    if (!user) {
      return null;
    }

    // Populate cache if Redis is available
    if (client) {
      try {
        await client.setex(cacheKey, USER_PROFILE_TTL, JSON.stringify(user));
      } catch (error) {
        console.warn('Cache write error for user profile:', error.message);
        // Continue without caching
      }
    }

    return {
      ...user,
      _fromCache: false,
      _cacheKey: cacheKey
    };
  } catch (error) {
    console.error('Database error fetching user profile:', error.message);
    throw error;
  }
};

/**
 * Search trips with caching
 * Requirements: 6.2 - Cache results for 30 seconds to handle repeated searches
 * Requirements: 6.5 - Fall back to database on cache miss or Redis failure
 * 
 * @param {Object} searchParams - Search parameters
 * @param {Function} searchFn - The actual search function to call on cache miss
 * @returns {Promise<Object>} Search results
 */
const searchTrips = async (searchParams, searchFn) => {
  const client = getRedisClient();
  const cacheKey = generateSearchCacheKey(searchParams);

  // Try cache first if Redis is available
  if (client) {
    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          _fromCache: true,
          _cacheKey: cacheKey
        };
      }
    } catch (error) {
      console.warn('Cache read error for trip search:', error.message);
      // Continue to database fallback
    }
  }

  // Cache miss or Redis unavailable - perform actual search
  // Requirements: 6.5 - Fall back to database
  try {
    const results = await searchFn(searchParams);

    // Populate cache if Redis is available and search was successful
    if (client && results && results.success) {
      try {
        await client.setex(cacheKey, TRIP_SEARCH_TTL, JSON.stringify(results));
      } catch (error) {
        console.warn('Cache write error for trip search:', error.message);
        // Continue without caching
      }
    }

    return {
      ...results,
      _fromCache: false,
      _cacheKey: cacheKey
    };
  } catch (error) {
    console.error('Database error searching trips:', error.message);
    throw error;
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
  // Delegate to locationCacheService which handles Redis storage
  return getLocationFromCache(driverId);
};


/**
 * Get trip details with caching
 * @param {string} tripId - Trip ID
 * @param {Function} fetchFn - Function to fetch trip details on cache miss
 * @returns {Promise<Object|null>} Trip details or null
 */
const getTripDetails = async (tripId, fetchFn) => {
  if (!tripId) {
    return null;
  }

  const client = getRedisClient();
  const cacheKey = `${CACHE_KEYS.TRIP_DETAILS}${tripId}`;

  // Try cache first if Redis is available
  if (client) {
    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          _fromCache: true,
          _cacheKey: cacheKey
        };
      }
    } catch (error) {
      console.warn('Cache read error for trip details:', error.message);
    }
  }

  // Cache miss - fetch from database
  try {
    const result = await fetchFn(tripId);

    // Populate cache if Redis is available
    if (client && result) {
      try {
        await client.setex(cacheKey, TRIP_DETAILS_TTL, JSON.stringify(result));
      } catch (error) {
        console.warn('Cache write error for trip details:', error.message);
      }
    }

    return result ? { ...result, _fromCache: false, _cacheKey: cacheKey } : null;
  } catch (error) {
    console.error('Database error fetching trip details:', error.message);
    throw error;
  }
};

// ============================================
// Cache Invalidation Functions
// Requirements: 6.4 - Cache invalidation on data updates
// ============================================

/**
 * Invalidate user profile cache
 * Requirements: 6.4 - Invalidate user cache on profile update
 * 
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether invalidation was successful
 */
const invalidateUserCache = async (userId) => {
  if (!userId) {
    return false;
  }

  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
    await client.del(cacheKey);
    return true;
  } catch (error) {
    console.warn('Cache invalidation error for user:', error.message);
    return false;
  }
};

/**
 * Invalidate trip cache (both search results and specific trip)
 * Requirements: 6.4 - Invalidate trip cache on status change
 * 
 * @param {string} tripId - Trip ID (optional, if provided invalidates specific trip)
 * @returns {Promise<Object>} Invalidation result
 */
const invalidateTripCache = async (tripId = null) => {
  const client = getRedisClient();
  if (!client) {
    return { success: false, reason: 'Redis not connected' };
  }

  try {
    let deletedKeys = 0;

    // Invalidate specific trip if tripId provided
    if (tripId) {
      const tripKey = `${CACHE_KEYS.TRIP_DETAILS}${tripId}`;
      await client.del(tripKey);
      deletedKeys++;
    }

    // Invalidate all search cache entries (they may contain stale trip data)
    // Use SCAN to avoid blocking Redis with KEYS command
    const searchPattern = `${CACHE_KEYS.TRIP_SEARCH}*`;
    let cursor = '0';
    
    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', searchPattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await client.del(...keys);
        deletedKeys += keys.length;
      }
    } while (cursor !== '0');

    return {
      success: true,
      deletedKeys,
      tripId
    };
  } catch (error) {
    console.warn('Cache invalidation error for trips:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Invalidate all caches for a specific pattern
 * @param {string} pattern - Cache key pattern to invalidate
 * @returns {Promise<number>} Number of keys deleted
 */
const invalidateByPattern = async (pattern) => {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }

  try {
    let deletedKeys = 0;
    let cursor = '0';
    
    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await client.del(...keys);
        deletedKeys += keys.length;
      }
    } while (cursor !== '0');

    return deletedKeys;
  } catch (error) {
    console.warn('Cache invalidation error:', error.message);
    return 0;
  }
};


// ============================================
// Cache Fallback Functions
// Requirements: 6.4, 6.5 - Fallback to database on Redis failure
// ============================================

/**
 * Get data with cache fallback
 * Generic function that tries cache first, then falls back to database
 * Requirements: 6.5 - Fall back to database on Redis failure
 * 
 * @param {string} cacheKey - Cache key
 * @param {number} ttl - TTL in seconds
 * @param {Function} fetchFn - Function to fetch data on cache miss
 * @returns {Promise<Object>} Data with cache metadata
 */
const getWithFallback = async (cacheKey, ttl, fetchFn) => {
  const client = getRedisClient();

  // Try cache first if Redis is available
  if (client) {
    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        return {
          data: JSON.parse(cached),
          fromCache: true,
          cacheKey
        };
      }
    } catch (error) {
      console.warn('Cache read error:', error.message);
      // Continue to database fallback
    }
  }

  // Cache miss or Redis unavailable - fetch from source
  try {
    const data = await fetchFn();

    // Populate cache if Redis is available
    if (client && data !== null && data !== undefined) {
      try {
        await client.setex(cacheKey, ttl, JSON.stringify(data));
      } catch (error) {
        console.warn('Cache write error:', error.message);
      }
    }

    return {
      data,
      fromCache: false,
      cacheKey
    };
  } catch (error) {
    console.error('Fetch error:', error.message);
    throw error;
  }
};

/**
 * Set cache value with error handling
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttl - TTL in seconds
 * @returns {Promise<boolean>} Whether set was successful
 */
const setCache = async (key, value, ttl) => {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Cache set error:', error.message);
    return false;
  }
};

/**
 * Get cache value with error handling
 * @param {string} key - Cache key
 * @returns {Promise<*>} Cached value or null
 */
const getCache = async (key) => {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Cache get error:', error.message);
    return null;
  }
};

/**
 * Delete cache value
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Whether delete was successful
 */
const deleteCache = async (key) => {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.warn('Cache delete error:', error.message);
    return false;
  }
};

// ============================================
// Cache Statistics
// ============================================

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
const getCacheStats = async () => {
  const client = getRedisClient();
  
  if (!client) {
    return {
      connected: false,
      userProfiles: 0,
      tripSearches: 0,
      tripDetails: 0
    };
  }

  try {
    // Count keys by pattern using SCAN
    const countKeys = async (pattern) => {
      let count = 0;
      let cursor = '0';
      
      do {
        const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        count += keys.length;
      } while (cursor !== '0');
      
      return count;
    };

    const [userProfiles, tripSearches, tripDetails] = await Promise.all([
      countKeys(`${CACHE_KEYS.USER_PROFILE}*`),
      countKeys(`${CACHE_KEYS.TRIP_SEARCH}*`),
      countKeys(`${CACHE_KEYS.TRIP_DETAILS}*`)
    ]);

    return {
      connected: true,
      userProfiles,
      tripSearches,
      tripDetails,
      ttl: {
        userProfile: USER_PROFILE_TTL,
        tripSearch: TRIP_SEARCH_TTL,
        tripDetails: TRIP_DETAILS_TTL
      }
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
  // Core cache functions - Requirements: 6.1, 6.2, 6.3
  getUserProfile,
  searchTrips,
  getDriverLocation,
  getTripDetails,
  
  // Cache invalidation - Requirements: 6.4
  invalidateUserCache,
  invalidateTripCache,
  invalidateByPattern,
  
  // Generic cache utilities - Requirements: 6.5
  getWithFallback,
  setCache,
  getCache,
  deleteCache,
  
  // Statistics
  getCacheStats,
  
  // Constants
  CACHE_KEYS,
  USER_PROFILE_TTL,
  TRIP_SEARCH_TTL,
  TRIP_DETAILS_TTL,
  
  // Utility
  generateSearchCacheKey
};
