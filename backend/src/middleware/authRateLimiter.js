/**
 * Auth-Specific Rate Limiting Middleware
 * Design Decision: Specialized rate limiters for authentication endpoints
 * Rationale: Prevents brute-force attacks on OTP and login endpoints
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4 - Auth-specific rate limiting with Retry-After headers
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { getRedisClient, isRedisConnected } = require('../config/redis');
const { logRateLimited } = require('../services/authAuditService');

/**
 * Rate limit configurations for auth endpoints
 * Requirements: 3.1, 3.2, 3.3 - Specific limits per endpoint type
 */
const AUTH_RATE_LIMITS = {
  otpRequest: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // 5 requests per 15 min per phone
    keyPrefix: 'auth:otp:request'
  },
  otpVerify: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 requests per 15 min per phone
    keyPrefix: 'auth:otp:verify'
  },
  staffLogin: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // 5 requests per 15 min per IP
    keyPrefix: 'auth:staff:login'
  }
};

/**
 * Calculate Retry-After time in seconds
 * Requirements: 3.4 - Include Retry-After header in 429 responses
 * 
 * @param {number} windowMs - Rate limit window in milliseconds
 * @param {number} resetTime - Reset timestamp
 * @returns {number} Seconds until rate limit resets
 */
const calculateRetryAfter = (windowMs, resetTime) => {
  if (resetTime) {
    const secondsRemaining = Math.ceil((resetTime - Date.now()) / 1000);
    return Math.max(1, secondsRemaining); // Ensure at least 1 second
  }
  return Math.ceil(windowMs / 1000);
};

/**
 * Create a Redis store for auth rate limiting
 * Falls back to memory store if Redis is unavailable
 * 
 * @param {string} prefix - Key prefix for Redis
 * @returns {Object|undefined} Redis store or undefined for memory fallback
 */
const createAuthRedisStore = (prefix) => {
  const redisClient = getRedisClient();
  
  if (!redisClient || !isRedisConnected()) {
    console.warn(`Auth rate limiter (${prefix}): Redis unavailable, using memory store`);
    return undefined; // Falls back to memory store
  }
  
  return new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: `rl:${prefix}:`
  });
};


/**
 * Create rate limit handler with Retry-After header and audit logging
 * Requirements: 3.4 - Return Retry-After header on 429 response
 * Requirements: 6.4 - Log rate limit events
 * 
 * @param {string} limitType - Type of rate limit (otpRequest, otpVerify, staffLogin)
 * @param {string} endpoint - Endpoint being rate limited
 * @returns {Function} Express handler function
 */
const createAuthRateLimitHandler = (limitType, endpoint) => {
  return async (req, res, options) => {
    const retryAfter = calculateRetryAfter(options.windowMs, req.rateLimit?.resetTime);
    
    // Extract identifier for logging (auth routes use 'identifier' field)
    const identifier = req.body?.identifier || req.body?.phone || req.body?.email || 'unknown';
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent');
    
    // Log the rate limit event (async, don't block response)
    logRateLimited(ipAddress, endpoint, identifier, userAgent, {
      limitType,
      limit: options.max,
      windowMs: options.windowMs,
      retryAfter
    }).catch(err => {
      console.error('Failed to log rate limit event:', err.message);
    });
    
    // Set Retry-After header (Requirements: 3.4)
    res.set('Retry-After', String(retryAfter));
    
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      errorCode: 'AUTH_009',
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter,
      limit: options.max,
      windowMs: options.windowMs
    });
  };
};

/**
 * Extract phone number from request for key generation
 * For OTP endpoints, we rate limit by phone number to prevent abuse
 * @param {Object} req - Express request object
 * @returns {string|undefined} Phone number or undefined to use default IP handling
 */
const extractPhoneKey = (req) => {
  // Try to get identifier from body (auth routes use 'identifier' field)
  // Also check 'phone' for backward compatibility
  const identifier = req.body?.identifier || req.body?.phone;
  if (identifier) {
    // Normalize phone number (remove spaces, dashes) and prefix with 'phone:'
    // to distinguish from IP-based keys
    return `phone:${identifier.replace(/[\s-]/g, '')}`;
  }
  // Return undefined to let express-rate-limit handle IP extraction properly
  // This ensures proper IPv6 handling
  return undefined;
};

/**
 * OTP Request Rate Limiter
 * Requirements: 3.1 - 5 OTP requests per phone number within 15 minutes
 */
const otpRequestLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMITS.otpRequest.windowMs,
  max: AUTH_RATE_LIMITS.otpRequest.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: createAuthRedisStore(AUTH_RATE_LIMITS.otpRequest.keyPrefix),
  keyGenerator: extractPhoneKey,
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/ready';
  },
  handler: createAuthRateLimitHandler('otpRequest', '/api/auth/request-otp')
});

/**
 * OTP Verify Rate Limiter
 * Requirements: 3.2 - 10 OTP verification attempts per phone number within 15 minutes
 */
const otpVerifyLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMITS.otpVerify.windowMs,
  max: AUTH_RATE_LIMITS.otpVerify.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: createAuthRedisStore(AUTH_RATE_LIMITS.otpVerify.keyPrefix),
  keyGenerator: extractPhoneKey,
  skip: (req) => {
    return req.path === '/health' || req.path === '/ready';
  },
  handler: createAuthRateLimitHandler('otpVerify', '/api/auth/verify-otp')
});

/**
 * Staff Login Rate Limiter
 * Requirements: 3.3 - 5 staff login attempts per IP within 15 minutes
 * Note: Uses default IP-based key generation (no custom keyGenerator)
 * to ensure proper IPv6 handling by express-rate-limit
 */
const staffLoginLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMITS.staffLogin.windowMs,
  max: AUTH_RATE_LIMITS.staffLogin.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: createAuthRedisStore(AUTH_RATE_LIMITS.staffLogin.keyPrefix),
  // No custom keyGenerator - let express-rate-limit handle IP extraction
  // This ensures proper IPv6 handling
  skip: (req) => {
    return req.path === '/health' || req.path === '/ready';
  },
  handler: createAuthRateLimitHandler('staffLogin', '/api/auth/staff-login')
});

/**
 * Reinitialize auth rate limiters with Redis store
 * Call this after Redis connection is established
 */
const reinitializeAuthRateLimiters = () => {
  const redisClient = getRedisClient();
  
  if (redisClient && isRedisConnected()) {
    console.log('Auth rate limiters: Reinitializing with Redis store');
    
    // Update stores for all auth limiters
    otpRequestLimiter.options.store = createAuthRedisStore(AUTH_RATE_LIMITS.otpRequest.keyPrefix);
    otpVerifyLimiter.options.store = createAuthRedisStore(AUTH_RATE_LIMITS.otpVerify.keyPrefix);
    staffLoginLimiter.options.store = createAuthRedisStore(AUTH_RATE_LIMITS.staffLogin.keyPrefix);
    
    console.log('✓ Auth rate limiters using Redis store');
  }
};

/**
 * Get auth rate limiter status
 * @returns {Object} Status of auth rate limiters
 */
const getAuthRateLimiterStatus = () => {
  const redisConnected = isRedisConnected();
  
  return {
    storeType: redisConnected ? 'redis' : 'memory',
    limiters: {
      otpRequest: {
        windowMs: AUTH_RATE_LIMITS.otpRequest.windowMs,
        max: AUTH_RATE_LIMITS.otpRequest.max,
        description: 'OTP request endpoint (per phone)'
      },
      otpVerify: {
        windowMs: AUTH_RATE_LIMITS.otpVerify.windowMs,
        max: AUTH_RATE_LIMITS.otpVerify.max,
        description: 'OTP verification endpoint (per phone)'
      },
      staffLogin: {
        windowMs: AUTH_RATE_LIMITS.staffLogin.windowMs,
        max: AUTH_RATE_LIMITS.staffLogin.max,
        description: 'Staff login endpoint (per IP)'
      }
    }
  };
};

module.exports = {
  // Rate limiters
  otpRequestLimiter,
  otpVerifyLimiter,
  staffLoginLimiter,
  
  // Utility functions
  reinitializeAuthRateLimiters,
  getAuthRateLimiterStatus,
  calculateRetryAfter,
  
  // Constants
  AUTH_RATE_LIMITS
};
