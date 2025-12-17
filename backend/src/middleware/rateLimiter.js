/**
 * Distributed Rate Limiting Middleware
 * Design Decision: Redis-backed rate limiting for horizontal scaling
 * Rationale: Works across multiple API instances with shared state
 * 
 * Requirements: 4.1, 4.3, 4.4 - Rate limiting with tiered limits and Retry-After headers
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { getRedisClient, isRedisConnected } = require('../config/redis');

/**
 * Calculate Retry-After time in seconds
 * @param {number} windowMs - Rate limit window in milliseconds
 * @param {number} resetTime - Reset timestamp
 * @returns {number} Seconds until rate limit resets
 */
const calculateRetryAfter = (windowMs, resetTime) => {
  if (resetTime) {
    return Math.ceil((resetTime - Date.now()) / 1000);
  }
  return Math.ceil(windowMs / 1000);
};

/**
 * Create rate limit response handler with Retry-After header
 * Requirements: 4.3 - Return Retry-After header on 429 response
 * @param {string} limitType - Type of rate limit (standard, critical, upload)
 * @returns {Function} Express handler function
 */
const createRateLimitHandler = (limitType) => {
  return (req, res, options) => {
    const retryAfter = calculateRetryAfter(options.windowMs, req.rateLimit?.resetTime);
    
    res.set('Retry-After', retryAfter);
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded for ${limitType} endpoint`,
      retryAfter,
      limit: options.max,
      windowMs: options.windowMs
    });
  };
};

/**
 * Create a Redis store for rate limiting
 * Falls back to memory store if Redis is unavailable
 * @param {string} prefix - Key prefix for Redis
 * @returns {Object|undefined} Redis store or undefined for memory fallback
 */
const createRedisStore = (prefix) => {
  const redisClient = getRedisClient();
  
  if (!redisClient || !isRedisConnected()) {
    console.warn(`Rate limiter (${prefix}): Redis unavailable, using memory store`);
    return undefined; // Falls back to memory store
  }
  
  return new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: `rl:${prefix}:`
  });
};

/**
 * Standard rate limiter for general endpoints
 * Requirements: 4.1 - 100 requests per minute per user
 */
const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  store: createRedisStore('standard'),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use default IP handling
    if (req.user?.id) {
      return req.user.id;
    }
    // Let express-rate-limit handle IP extraction properly
    return undefined;
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/ready' || req.path === '/live';
  },
  handler: createRateLimitHandler('standard')
});

/**
 * Critical rate limiter for SOS and tracking endpoints
 * Requirements: 4.4 - Higher rate limits for critical endpoints
 */
const criticalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute for critical endpoints
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('critical'),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use default IP handling
    if (req.user?.id) {
      return req.user.id;
    }
    // Let express-rate-limit handle IP extraction properly
    return undefined;
  },
  handler: createRateLimitHandler('critical')
});

/**
 * Upload rate limiter for document uploads
 * Requirements: 4.4 - Lower rate limits for upload endpoints
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 upload requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('upload'),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use default IP handling
    if (req.user?.id) {
      return req.user.id;
    }
    // Let express-rate-limit handle IP extraction properly
    return undefined;
  },
  handler: createRateLimitHandler('upload')
});

/**
 * Reinitialize rate limiters with Redis store
 * Call this after Redis connection is established
 */
const reinitializeRateLimiters = () => {
  const redisClient = getRedisClient();
  
  if (redisClient && isRedisConnected()) {
    console.log('Rate limiters: Reinitializing with Redis store');
    
    // Update stores for all limiters
    standardLimiter.options.store = createRedisStore('standard');
    criticalLimiter.options.store = createRedisStore('critical');
    uploadLimiter.options.store = createRedisStore('upload');
    
    console.log('✓ Rate limiters using Redis store');
  }
};

/**
 * Get rate limiter status
 * @returns {Object} Status of rate limiters
 */
const getRateLimiterStatus = () => {
  const redisConnected = isRedisConnected();
  
  return {
    storeType: redisConnected ? 'redis' : 'memory',
    limiters: {
      standard: {
        windowMs: 60000,
        max: 100,
        description: 'General API endpoints'
      },
      critical: {
        windowMs: 60000,
        max: 300,
        description: 'SOS and tracking endpoints'
      },
      upload: {
        windowMs: 60000,
        max: 20,
        description: 'Document upload endpoints'
      }
    }
  };
};

module.exports = {
  standardLimiter,
  criticalLimiter,
  uploadLimiter,
  reinitializeRateLimiters,
  getRateLimiterStatus,
  calculateRetryAfter
};
